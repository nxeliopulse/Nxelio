-- ============================================================================
-- 0126_secure_billing_rpcs.sql
--
-- Closes gaps found in a full subscription-module audit:
--
-- 1. deduct_credits / deduct_leads / redeem_promotion_start are called via
--    the user-token Supabase client with a client-supplied workspace_id, and
--    were never checked against the caller's own workspace, nor revoked from
--    PUBLIC (unlike consume_credits/etc. in 0031_credit_transactions.sql,
--    which already do this correctly). Any authenticated user could call
--    them directly via PostgREST with someone else's workspace_id. Fixed by
--    checking p_workspace_id against get_current_workspace_id() whenever
--    there's a real logged-in caller (service-role calls have no JWT, so
--    get_current_workspace_id() is NULL there and the check is skipped —
--    trusted since only our own server code holds that key), plus an
--    explicit REVOKE+GRANT.
--
-- 2. deduct_credits/deduct_leads never floored p_amount at 0 — a negative
--    amount would inflate the caller's own balance with no limit. Fixed
--    with an explicit p_amount <= 0 check.
--
-- 3. reset_subscription_cycle and redeem_promotion_finalize are ONLY ever
--    called from admin/service-role contexts (webhook, cron) — locked down
--    to service_role only, no authenticated grant at all.
--
-- 4. redeem_promotion_finalize granted its bonus without ever checking a
--    real Stripe subscription existed for the workspace. Fixed by requiring
--    an active/trialing subscription with a real stripe_subscription_id
--    (and, when passed, that it matches) before granting anything.
--
-- 5. reset_subscription_cycle's idempotency guard (0124) compared
--    last_synced_resource_version (bigint) directly against a Stripe
--    invoice id string with no cast — `bigint = text` has no operator in
--    Postgres, so every real invoice.paid webhook threw and credits/leads
--    never reset on renewal. Fixed by widening the column to TEXT.
--
-- 6. syncSubscriptionFromStripe (app code) did an unlocked read-then-upsert
--    with no row lock, racing against itself when a route's direct Stripe
--    call and Stripe's own webhook both sync the same change around the
--    same time — can double-grant a plan-change's credits/ledger entry or
--    lose a concurrent credit spend. Fixed by moving that logic into this
--    new sync_subscription_from_stripe() RPC, which does the whole
--    read-decide-write-ledger sequence atomically under FOR UPDATE.
-- ============================================================================

-- ── 5. Fix bigint/text mismatch ─────────────────────────────────────────────
ALTER TABLE subscriptions
  ALTER COLUMN last_synced_resource_version TYPE TEXT
  USING last_synced_resource_version::TEXT;

-- ── 3+5. reset_subscription_cycle: service_role only, TEXT-safe now ────────
CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID, p_idempotency_key TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_idempotency_key IS NOT NULL AND v_sub.last_synced_resource_version = p_idempotency_key THEN
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining            = v_plan.credits_per_cycle,
    credits_total                = v_plan.credits_per_cycle,
    leads_remaining               = v_plan.leads_per_cycle,
    leads_total                   = v_plan.leads_per_cycle,
    current_period_start         = now(),
    current_period_end           = CASE
                                      WHEN v_sub.billing_interval = 'annual'
                                      THEN now() + INTERVAL '1 year'
                                      ELSE now() + INTERVAL '30 days'
                                    END,
    low_balance_notified_at      = NULL,
    status                        = 'active',
    last_synced_resource_version = COALESCE(p_idempotency_key, v_sub.last_synced_resource_version),
    updated_at                    = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) TO service_role;

-- ── 1+2. deduct_credits: ownership check + amount floor + REVOKE/GRANT ─────
CREATE OR REPLACE FUNCTION deduct_credits(
  p_workspace_id    UUID,
  p_operation_type  TEXT,
  p_amount          INTEGER DEFAULT 1,
  p_lead_id         UUID    DEFAULT NULL,
  p_campaign_id     UUID    DEFAULT NULL,
  p_metadata        JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_bal  INTEGER;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  SELECT * INTO v_sub
  FROM subscriptions WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trial period has ended — please refresh in a moment while your subscription syncs.');
  END IF;

  IF v_sub.credits_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credits',
                              'remaining', v_sub.credits_remaining);
  END IF;

  v_bal := v_sub.credits_remaining - p_amount;

  UPDATE subscriptions
  SET credits_remaining = v_bal, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta,
     lead_id, campaign_id, status, metadata)
  VALUES
    (p_workspace_id, v_sub.id, p_operation_type, -p_amount,
     p_lead_id, p_campaign_id, 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_bal, 'deducted', p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) TO authenticated, service_role;

-- ── 1+2. deduct_leads: ownership check + amount floor + REVOKE/GRANT ───────
CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.leads_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining', 'remaining', v_sub.leads_remaining);
  END IF;

  UPDATE subscriptions SET
    leads_remaining = leads_remaining - p_amount,
    updated_at      = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_sub.leads_remaining - p_amount, 'deducted', p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) TO authenticated, service_role;

-- ── 1. redeem_promotion_start: ownership check + REVOKE/GRANT ──────────────
CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT,
  p_email        TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.restricted_email IS NOT NULL
     AND (p_email IS NULL OR lower(trim(p_email)) <> lower(v_promo.restricted_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for your account');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, stripe_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.stripe_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'stripe_coupon_id', v_promo.stripe_coupon_id,
    'stripe_promotion_code_id', v_promo.stripe_promotion_code_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ── 3+4. redeem_promotion_finalize: real-payment check + service_role only ─
CREATE OR REPLACE FUNCTION redeem_promotion_finalize(
  p_workspace_id UUID,
  p_checkout_session_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_checkout_session_id IS NULL OR stripe_checkout_session_id = p_checkout_session_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);  -- normal case: no promo used
  END IF;

  -- Only grant a real bonus once Stripe has actually confirmed a paid
  -- subscription for this workspace — a 'pending' reservation alone (made
  -- before checkout even started) must never be enough to unlock it.
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND
     OR v_sub.stripe_subscription_id IS NULL
     OR v_sub.status NOT IN ('active', 'trialing')
     OR (p_stripe_subscription_id IS NOT NULL AND v_sub.stripe_subscription_id <> p_stripe_subscription_id) THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'error', 'No confirmed Stripe subscription to attach this promo to yet');
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    UPDATE subscriptions SET
      credits_remaining = credits_remaining + v_redemption.bonus_credits_granted,
      credits_total     = credits_total + v_redemption.bonus_credits_granted,
      leads_remaining   = leads_remaining + v_redemption.bonus_leads_granted,
      leads_total       = leads_total + v_redemption.bonus_leads_granted,
      updated_at        = now()
    WHERE id = v_sub.id;

    IF v_redemption.bonus_credits_granted > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_credits_granted, 'credits', 'completed',
              jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
    END IF;
    IF v_redemption.bonus_leads_granted > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_leads_granted, 'leads', 'completed',
              jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) TO service_role;

-- ── 6. sync_subscription_from_stripe: atomic read-decide-write-ledger,
--    replacing the app-code select-then-upsert that raced against itself ───
CREATE OR REPLACE FUNCTION sync_subscription_from_stripe(
  p_workspace_id UUID,
  p_plan_id TEXT,
  p_billing_interval TEXT,
  p_status TEXT,
  p_credits_total INTEGER,
  p_leads_total INTEGER,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_trial_ends_at TIMESTAMPTZ,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_price_id TEXT,
  p_cancel_at_period_end BOOLEAN,
  p_canceled_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing        subscriptions%ROWTYPE;
  v_plan_changed     BOOLEAN;
  v_credits_remaining INTEGER;
  v_leads_remaining   INTEGER;
  v_sub_id            UUID;
BEGIN
  SELECT * INTO v_existing FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  v_plan_changed      := FOUND AND v_existing.plan_id <> p_plan_id;
  v_credits_remaining := CASE WHEN v_plan_changed OR NOT FOUND THEN p_credits_total ELSE v_existing.credits_remaining END;
  v_leads_remaining   := CASE WHEN v_plan_changed OR NOT FOUND THEN p_leads_total   ELSE v_existing.leads_remaining   END;

  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    credits_remaining, credits_total, leads_remaining, leads_total,
    trial_ends_at, current_period_start, current_period_end,
    stripe_customer_id, stripe_subscription_id, stripe_price_id,
    cancel_at_period_end, canceled_at, updated_at
  ) VALUES (
    p_workspace_id, p_plan_id, p_billing_interval, p_status,
    v_credits_remaining, p_credits_total, v_leads_remaining, p_leads_total,
    p_trial_ends_at, p_current_period_start, p_current_period_end,
    p_stripe_customer_id, p_stripe_subscription_id, p_stripe_price_id,
    p_cancel_at_period_end, p_canceled_at, now()
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id                = EXCLUDED.plan_id,
    billing_interval        = EXCLUDED.billing_interval,
    status                   = EXCLUDED.status,
    credits_remaining        = EXCLUDED.credits_remaining,
    credits_total            = EXCLUDED.credits_total,
    leads_remaining           = EXCLUDED.leads_remaining,
    leads_total               = EXCLUDED.leads_total,
    trial_ends_at             = EXCLUDED.trial_ends_at,
    current_period_start     = EXCLUDED.current_period_start,
    current_period_end       = EXCLUDED.current_period_end,
    stripe_customer_id        = EXCLUDED.stripe_customer_id,
    stripe_subscription_id     = EXCLUDED.stripe_subscription_id,
    stripe_price_id            = EXCLUDED.stripe_price_id,
    cancel_at_period_end       = EXCLUDED.cancel_at_period_end,
    canceled_at                = EXCLUDED.canceled_at,
    updated_at                 = now()
  RETURNING id INTO v_sub_id;

  IF v_plan_changed THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub_id, 'plan_change', p_credits_total, 'credits', 'completed',
            jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    IF p_leads_total > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub_id, 'plan_change', p_leads_total, 'leads', 'completed',
              jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;
