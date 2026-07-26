-- ============================================================================
-- 0070_reprice_and_remove_topup.sql
--
-- 1. Reprice Starter and Pro (Basic unchanged) and raise their monthly
--    AI-discovered-leads allowance. Applied immediately to existing
--    subscriptions, same "apply now" policy used for prior repricing events.
-- 2. Remove the Lead Top-Up feature entirely (buy extra leads for $149) —
--    drop credit_top_ups, grant_leads_topup, and the topup_leads_remaining
--    column, and simplify deduct_leads back to a single leads currency.
-- ============================================================================

-- ── 1. Reprice ───────────────────────────────────────────────────────────
UPDATE subscription_plans SET
  monthly_price_cents = 14999, annual_price_cents = 143990, leads_per_cycle = 1000
WHERE id = 'starter';

UPDATE subscription_plans SET
  monthly_price_cents = 29999, annual_price_cents = 287990, leads_per_cycle = 2000
WHERE id = 'pro';

UPDATE subscriptions s
SET leads_total = sp.leads_per_cycle,
    leads_remaining = sp.leads_per_cycle
FROM subscription_plans sp
WHERE s.plan_id = sp.id AND sp.id IN ('starter', 'pro');

-- ── 2. Remove Lead Top-Up ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS grant_leads_topup(UUID, INTEGER, INTEGER, TEXT);
DROP TABLE IF EXISTS credit_top_ups CASCADE;

ALTER TABLE subscriptions DROP COLUMN IF EXISTS topup_leads_remaining;

-- deduct_leads: back to a single currency, no top-up fallback.
CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
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
