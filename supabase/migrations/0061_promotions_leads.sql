-- ============================================================================
-- 0061_promotions_leads.sql
--
-- Three things in one migration:
-- 1. Reprice + restructure feature gates: Basic $15.99/mo now unlocks
--    enrichment/scoring/LinkedIn outreach/reply tracking/meetings (still no
--    automated discovery — bring-your-own-leads only). Starter $69/mo and
--    Pro $149/mo credit/lead allowances drop to 300/300 and 1000/1000
--    respectively (superseding whatever 0038/0039/0060 set previously).
-- 2. Introduce "leads" as a second currency, separate from AI credits,
--    following the exact same pattern as credits (subscriptions columns +
--    credit_ledger entries + a deduct_/grant_ RPC pair). Purchased top-up
--    leads are tracked separately (topup_leads_remaining) so they persist
--    across cycle resets, unlike the monthly plan allowance.
-- 3. Promo codes: percentage/fixed discount (via a real Chargebee coupon),
--    and/or bonus credits, and/or bonus leads, categorized (referral/
--    launch/seasonal/student/general) for reporting. Chargebee remains the
--    only billing gateway — chargebee_coupon_id, never a Stripe id.
-- ============================================================================

-- ── 1. Reprice + feature gates + leads_per_cycle on the plan catalog ────────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS leads_per_cycle INTEGER NOT NULL DEFAULT 0;

UPDATE subscription_plans SET
  monthly_price_cents = 1599, annual_price_cents = 15350,
  credits_per_cycle = 200, leads_per_cycle = 0,
  features = '{"discovery":false,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":true}'
WHERE id = 'basic';

UPDATE subscription_plans SET
  monthly_price_cents = 6900, annual_price_cents = 66240,
  credits_per_cycle = 300, leads_per_cycle = 300,
  features = '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":true}'
WHERE id = 'starter';

UPDATE subscription_plans SET
  monthly_price_cents = 14900, annual_price_cents = 143040,
  credits_per_cycle = 1000, leads_per_cycle = 1000,
  features = '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}'
WHERE id = 'pro';

-- ── 2. Leads currency on subscriptions ───────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS leads_remaining       INTEGER NOT NULL DEFAULT 0 CHECK (leads_remaining >= 0),
  ADD COLUMN IF NOT EXISTS leads_total           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_leads_remaining INTEGER NOT NULL DEFAULT 0 CHECK (topup_leads_remaining >= 0);

-- Give every existing workspace its plan's lead allowance immediately
-- (otherwise everyone sits at 0 leads until their next renewal touches reset_subscription_cycle),
-- and cap credits to the new (in Starter/Pro's case, much lower) allowances —
-- same "apply immediately to everyone" policy used for the last repricing.
UPDATE subscriptions s
SET
  leads_remaining   = sp.leads_per_cycle,
  leads_total       = sp.leads_per_cycle,
  credits_total     = sp.credits_per_cycle,
  credits_remaining = LEAST(s.credits_remaining, sp.credits_per_cycle)
FROM subscription_plans sp
WHERE s.plan_id = sp.id;

-- ── credit_ledger: tag which currency each entry is about ───────────────────
ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'credits'
  CHECK (resource_type IN ('credits','leads'));

-- ── credit_top_ups: repurpose this table for lead top-ups too. It was
--    defined in an earlier migration file but never actually created in this
--    database (nothing in the app reads/writes it today), so create it here
--    defensively with its original schema before renaming/extending it.
CREATE TABLE IF NOT EXISTS credit_top_ups (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credits              INTEGER NOT NULL,
  price_cents          INTEGER NOT NULL,
  expires_at           TIMESTAMPTZ,
  chargebee_invoice_id TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE credit_top_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_top_ups_workspace_read ON credit_top_ups;
CREATE POLICY credit_top_ups_workspace_read ON credit_top_ups FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
);

-- Renamed `credits` -> `quantity` since it's now dual-purpose (credits or leads).
ALTER TABLE credit_top_ups RENAME COLUMN credits TO quantity;
ALTER TABLE credit_top_ups ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'credits'
  CHECK (resource_type IN ('credits','leads'));

-- ── 3. Promotions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,   -- stored UPPERCASE by convention
  name                  TEXT,
  description           TEXT,
  category              TEXT CHECK (category IS NULL OR category IN ('referral','launch','seasonal','student','general')),
  discount_type         TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage','fixed_amount')),
  discount_value        NUMERIC,                -- display-only mirror; the Chargebee coupon is authoritative for actual math
  chargebee_coupon_id   TEXT,                   -- NULL if this code grants no price discount
  bonus_credits         INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  bonus_leads           INTEGER NOT NULL DEFAULT 0 CHECK (bonus_leads >= 0),
  applicable_plans      TEXT[],                 -- NULL/empty = all plans
  max_redemptions       INTEGER,                -- NULL = unlimited
  times_redeemed        INTEGER NOT NULL DEFAULT 0,
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until           TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (chargebee_coupon_id IS NOT NULL OR bonus_credits > 0 OR bonus_leads > 0)
);

DROP TRIGGER IF EXISTS promotions_updated_at ON promotions;
CREATE TRIGGER promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();  -- reuses existing fn from 0029_subscriptions.sql

CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  promotion_id               UUID NOT NULL REFERENCES promotions(id),
  status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  bonus_credits_granted      INTEGER NOT NULL DEFAULT 0,
  bonus_leads_granted        INTEGER NOT NULL DEFAULT 0,
  chargebee_coupon_id        TEXT,
  chargebee_hosted_page_id   TEXT,
  chargebee_subscription_id  TEXT,
  metadata                   JSONB DEFAULT '{}',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at               TIMESTAMPTZ
);

-- One pending redemption per workspace+promotion — an abandoned/retried
-- checkout reuses the same row instead of piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_redemptions_pending_unique
  ON promotion_redemptions (workspace_id, promotion_id) WHERE status = 'pending';
-- One completed redemption per workspace+promotion ever — hard double-redeem block.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_redemptions_completed_unique
  ON promotion_redemptions (workspace_id, promotion_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS promotion_redemptions_workspace_idx
  ON promotion_redemptions (workspace_id, created_at DESC);

-- ── redeem_promotion_start: validate + reserve, called BEFORE the Chargebee
--    checkout call from checkout/route.ts ───────────────────────────────────
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
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, chargebee_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.chargebee_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'chargebee_coupon_id', v_promo.chargebee_coupon_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;

-- ── redeem_promotion_finalize: called AFTER Chargebee confirms the
--    subscription was actually created (checkout-return / webhook) ─────────
CREATE OR REPLACE FUNCTION redeem_promotion_finalize(
  p_workspace_id UUID,
  p_hosted_page_id TEXT DEFAULT NULL,
  p_chargebee_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_hosted_page_id IS NULL OR chargebee_hosted_page_id = p_hosted_page_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);  -- normal case: no promo used
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), chargebee_subscription_id = p_chargebee_subscription_id
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

-- ── 4. deduct_leads: mirrors deduct_credits() exactly, but spends the
--    monthly plan allowance first, then falls back to purchased top-up leads ──
CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub        subscriptions%ROWTYPE;
  v_from_plan  INTEGER;
  v_from_topup INTEGER;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF (v_sub.leads_remaining + v_sub.topup_leads_remaining) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining',
      'remaining', v_sub.leads_remaining + v_sub.topup_leads_remaining);
  END IF;

  v_from_plan  := LEAST(v_sub.leads_remaining, p_amount);
  v_from_topup := p_amount - v_from_plan;

  UPDATE subscriptions SET
    leads_remaining       = leads_remaining - v_from_plan,
    topup_leads_remaining = topup_leads_remaining - v_from_topup,
    updated_at            = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true,
    'remaining', (v_sub.leads_remaining - v_from_plan) + (v_sub.topup_leads_remaining - v_from_topup),
    'deducted', p_amount);
END;
$$;

-- ── grant_leads_topup: called after a successful Chargebee one-time charge ──
CREATE OR REPLACE FUNCTION grant_leads_topup(
  p_workspace_id UUID,
  p_leads        INTEGER,
  p_price_cents  INTEGER,
  p_chargebee_invoice_id TEXT DEFAULT NULL
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

  INSERT INTO credit_top_ups (workspace_id, quantity, resource_type, price_cents, chargebee_invoice_id)
  VALUES (p_workspace_id, p_leads, 'leads', p_price_cents, p_chargebee_invoice_id);

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_topup', p_leads, 'leads', 'completed',
          jsonb_build_object('price_cents', p_price_cents, 'chargebee_invoice_id', p_chargebee_invoice_id));

  RETURN jsonb_build_object('ok', true, 'topup_leads_remaining', v_sub.topup_leads_remaining + p_leads);
END;
$$;

-- ── 5. reset_subscription_cycle: now also resets the monthly leads
--    allowance from the plan (topup_leads_remaining is untouched — it
--    persists across cycles since it was separately purchased) ─────────────
CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub  FROM subscriptions      WHERE workspace_id = p_workspace_id FOR UPDATE;
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining       = v_plan.credits_per_cycle,
    credits_total           = v_plan.credits_per_cycle,
    leads_remaining         = v_plan.leads_per_cycle,
    leads_total             = v_plan.leads_per_cycle,
    current_period_start    = now(),
    current_period_end      = CASE
                                WHEN v_sub.billing_interval = 'annual'
                                THEN now() + INTERVAL '1 year'
                                ELSE now() + INTERVAL '30 days'
                              END,
    low_balance_notified_at = NULL,
    status                  = 'active',
    updated_at              = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));
  END IF;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE promotions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotions_public_read ON promotions;
CREATE POLICY promotions_public_read ON promotions FOR SELECT USING (true);
-- (mirrors subscription_plans_public_read — needed so client-side code can validate a code)

DROP POLICY IF EXISTS promotion_redemptions_workspace_read ON promotion_redemptions;
CREATE POLICY promotion_redemptions_workspace_read
  ON promotion_redemptions FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE policy for authenticated users — all writes go
-- through the two SECURITY DEFINER RPCs above, exactly like deduct_credits /
-- reset_subscription_cycle already do for subscriptions/credit_ledger.
