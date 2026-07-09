-- ============================================================
-- 0038_reprice.sql
-- Reprices all three subscription plans to market rate.
-- Basic $19/mo, Starter $89/mo, Pro $159/mo (20% annual discount).
-- Credits: Basic 500, Starter 3,000, Pro 8,000.
-- LinkedIn outreach unlocked at Starter tier (was Pro-only).
-- ============================================================

-- ── 1. Update plan prices, credits, and feature flags ───────
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic', 'Basic', 1900, 18240, 500, 7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":false}',
   1),
  ('starter', 'Starter', 8900, 85440, 3000, 0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro', 'Pro', 15900, 152640, 8000, 0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Update the workspace subscription trigger ─────────────
-- Patch create_workspace_subscription to grant 500 trial credits
-- instead of the old hardcoded 150.
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
    500, 500
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 500, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

-- ── 3. Update existing Basic trial subscriptions ─────────────
-- Bump credits_total (and remaining if not yet used) for any
-- workspace currently on the Basic trial with the old 150 allocation.
UPDATE subscriptions
SET
  credits_total     = 500,
  credits_remaining = LEAST(credits_remaining + (500 - credits_total), 500)
WHERE
  plan_id = 'basic'
  AND status = 'trialing'
  AND credits_total = 150;
