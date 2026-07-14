-- ============================================================
-- 0039_reprice_v2.sql
-- Reprices all three subscription plans (supersedes 0038).
-- Basic $9.99/mo, Starter $69/mo, Pro $149/mo (20% annual discount).
-- Credits: Basic 200, Starter 1,200, Pro 3,000.
-- Feature flags are unchanged from 0038 — only price/credits move.
-- ============================================================

-- ── 1. Update plan prices and credits (features carried forward) ───────
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic', 'Basic', 999, 9590, 200, 7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":false}',
   1),
  ('starter', 'Starter', 6900, 66240, 1200, 0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro', 'Pro', 14900, 143040, 3000, 0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Update the workspace subscription trigger ─────────────
-- Patch create_workspace_subscription to grant 200 trial credits
-- instead of the old 500 (from 0038).
CREATE OR REPLACE FUNCTION create_workspace_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    trial_ends_at, current_period_start, current_period_end,
    credits_remaining, credits_total
  ) VALUES (
    NEW.id, 'basic', 'monthly', 'trialing',
    now() + INTERVAL '7 days',
    now(),
    now() + INTERVAL '7 days',
    200, 200
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 200, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

-- ── 3. Cap every existing subscription to the new (lower) plan values ──
-- Applies immediately to trialing, active, and past_due workspaces alike.
-- Never grants extra credits — only ratchets credits_total down to the
-- new allocation and caps credits_remaining at that new total.
UPDATE subscriptions s
SET
  credits_total     = sp.credits_per_cycle,
  credits_remaining = LEAST(s.credits_remaining, sp.credits_per_cycle)
FROM subscription_plans sp
WHERE s.plan_id = sp.id;
