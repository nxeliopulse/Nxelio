-- ============================================================================
-- 0068_stripe_billing.sql
--
-- Replace Chargebee-specific ID columns with Stripe ones across the billing
-- schema. No real subscribers exist yet, so this is a straightforward rename
-- — no data-preservation logic needed. Three RPCs reference the renamed
-- columns in their bodies (redeem_promotion_start, redeem_promotion_finalize,
-- grant_leads_topup) and are recreated below with updated column/param names.
-- ============================================================================

-- Each rename below is guarded so this migration is safe to re-run from
-- scratch regardless of how far a previous partial run got.
CREATE OR REPLACE FUNCTION _rename_column_if_needed(
  p_table TEXT, p_from TEXT, p_to TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = p_table AND column_name = p_from)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = p_table AND column_name = p_to) THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', p_table, p_from, p_to);
  END IF;
END;
$$;

-- ── subscriptions ────────────────────────────────────────────────────────
SELECT _rename_column_if_needed('subscriptions', 'chargebee_customer_id',     'stripe_customer_id');
SELECT _rename_column_if_needed('subscriptions', 'chargebee_subscription_id', 'stripe_subscription_id');
SELECT _rename_column_if_needed('subscriptions', 'chargebee_plan_id',         'stripe_price_id');

-- ── credit_top_ups: one-time top-up charges become Stripe PaymentIntents ───
SELECT _rename_column_if_needed('credit_top_ups', 'chargebee_invoice_id', 'stripe_payment_intent_id');

-- ── promotions: the Chargebee coupon becomes a Stripe Coupon, plus Stripe's
--    separate customer-facing Promotion Code object layered on top of it ──
SELECT _rename_column_if_needed('promotions', 'chargebee_coupon_id', 'stripe_coupon_id');
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT;

-- ── promotion_redemptions ────────────────────────────────────────────────
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_coupon_id',       'stripe_coupon_id');
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_hosted_page_id',  'stripe_checkout_session_id');
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_subscription_id', 'stripe_subscription_id');

DROP FUNCTION _rename_column_if_needed(TEXT, TEXT, TEXT);

-- ── redeem_promotion_start: validate + reserve, called BEFORE the Stripe
--    Checkout Session is created from checkout/route.ts ───────────────────
CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
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

-- ── redeem_promotion_finalize: called AFTER Stripe confirms the
--    subscription was actually created (checkout-return / webhook) ────────
-- Parameter names changed from the Chargebee version (p_hosted_page_id,
-- p_chargebee_subscription_id) — CREATE OR REPLACE can't rename params,
-- so the old signature is dropped first (harmless if already gone).
DROP FUNCTION IF EXISTS redeem_promotion_finalize(UUID, TEXT, TEXT);

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

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
    IF FOUND THEN
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
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;

-- ── grant_leads_topup: called after a successful Stripe PaymentIntent ──────
-- Same param-rename issue as above (p_chargebee_invoice_id -> p_stripe_payment_intent_id).
DROP FUNCTION IF EXISTS grant_leads_topup(UUID, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION grant_leads_topup(
  p_workspace_id UUID,
  p_leads        INTEGER,
  p_price_cents  INTEGER,
  p_stripe_payment_intent_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  UPDATE subscriptions SET topup_leads_remaining = topup_leads_remaining + p_leads, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_top_ups (workspace_id, quantity, resource_type, price_cents, stripe_payment_intent_id)
  VALUES (p_workspace_id, p_leads, 'leads', p_price_cents, p_stripe_payment_intent_id);

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_topup', p_leads, 'leads', 'completed',
          jsonb_build_object('price_cents', p_price_cents, 'stripe_payment_intent_id', p_stripe_payment_intent_id));

  RETURN jsonb_build_object('ok', true, 'topup_leads_remaining', v_sub.topup_leads_remaining + p_leads);
END;
$$;
