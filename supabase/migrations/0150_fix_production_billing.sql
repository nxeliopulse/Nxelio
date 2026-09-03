-- ============================================================================
-- Fix production billing: a paid Stripe checkout was never recorded because
-- the sync path is missing several pieces in the hand-built production DB
-- (project sgvofunorxnicxulpjdg).
--
-- Confirmed by inspecting production directly:
--   * function sync_subscription_from_stripe   -> MISSING   (0126)
--   * subscriptions.canceled_at column          -> MISSING   (0123)
--   * subscriptions.last_synced_resource_version-> BIGINT, must be TEXT (0126)
--   * subscription_plans                        -> EMPTY, but subscriptions
--     .plan_id has an FK to it, so ANY insert would fail even once the
--     function existed.
--
-- Without these, /checkout-return calls the RPC, the RPC does not exist, and
-- syncSubscriptionFromStripe() only console.errors the failure — so the user
-- is charged by Stripe and the app still shows the "Choose your plan" gate.
--
-- Safe to re-run, and safe on environments that are already correct.
-- ============================================================================

-- 1. Columns the sync function writes ----------------------------------------
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- 0126 widened this to TEXT because reset_subscription_cycle compares it to a
-- Stripe invoice id (a string). Production still has the original BIGINT, so
-- every renewal would throw `bigint = text has no operator`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'last_synced_resource_version'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE subscriptions
      ALTER COLUMN last_synced_resource_version TYPE TEXT
      USING last_synced_resource_version::TEXT;
  END IF;
END $$;

-- 2. Seed subscription_plans --------------------------------------------------
-- subscriptions.plan_id REFERENCES subscription_plans(id), so an empty table
-- makes every subscription insert fail on the foreign key. Values are the
-- final state after the repricing chain (0067/0071/0072/0091/0113) and must
-- stay in step with PLAN_CREDITS / PLAN_LEADS in src/lib/stripe.ts.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS leads_per_cycle INTEGER NOT NULL DEFAULT 0;

INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle,
   leads_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic',   'Basic',    1499,  14390,  400,    0, 7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":true,"meetings":false}',
   1),
  ('starter', 'Starter', 14999, 143990, 1400, 1000, 0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro',     'Pro',     29999, 287990, 2400, 2000, 0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  leads_per_cycle     = EXCLUDED.leads_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features,
  sort_order          = EXCLUDED.sort_order;

-- 3. The missing RPC — verbatim from 0126_secure_billing_rpcs.sql -------------
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
  v_existing          subscriptions%ROWTYPE;
  v_plan_changed      BOOLEAN;
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
    billing_interval       = EXCLUDED.billing_interval,
    status                 = EXCLUDED.status,
    credits_remaining      = EXCLUDED.credits_remaining,
    credits_total          = EXCLUDED.credits_total,
    leads_remaining        = EXCLUDED.leads_remaining,
    leads_total            = EXCLUDED.leads_total,
    trial_ends_at          = EXCLUDED.trial_ends_at,
    current_period_start   = EXCLUDED.current_period_start,
    current_period_end     = EXCLUDED.current_period_end,
    stripe_customer_id     = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id        = EXCLUDED.stripe_price_id,
    cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
    canceled_at            = EXCLUDED.canceled_at,
    updated_at             = now()
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
