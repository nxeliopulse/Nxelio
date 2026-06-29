-- ============================================================
-- 0028_subscriptions.sql
-- Subscription plans, per-workspace subscriptions, credit
-- ledger, top-up packs.  Chargebee is the billing engine
-- (Stripe connected inside Chargebee as the payment gateway).
-- ============================================================

-- ── 1. Plan definitions (static reference) ──────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                    TEXT PRIMARY KEY,   -- 'basic' | 'starter' | 'pro'
  name                  TEXT NOT NULL,
  monthly_price_cents   INTEGER NOT NULL,
  annual_price_cents    INTEGER NOT NULL,   -- full year price, already discounted
  credits_per_cycle     INTEGER NOT NULL,
  trial_days            INTEGER NOT NULL DEFAULT 0,
  features              JSONB NOT NULL DEFAULT '{}',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Seed plan rows (idempotent)
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic',   'Basic',    899,   8990,    150,  7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":false,"priority_support":false}',
   1),
  ('starter', 'Starter',  5900,  59000,  1000,  0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false}',
   2),
  ('pro',     'Pro',     13900, 139000,  2500,  0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Subscriptions (one per workspace) ────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id                  TEXT    NOT NULL REFERENCES subscription_plans(id) DEFAULT 'basic',
  billing_interval         TEXT    NOT NULL DEFAULT 'monthly'
                             CHECK (billing_interval IN ('monthly','annual')),
  status                   TEXT    NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at            TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  credits_remaining        INTEGER NOT NULL DEFAULT 150  CHECK (credits_remaining >= 0),
  credits_total            INTEGER NOT NULL DEFAULT 150,
  low_balance_notified_at  TIMESTAMPTZ,
  -- Chargebee / Stripe references
  chargebee_customer_id      TEXT,
  chargebee_subscription_id  TEXT UNIQUE,
  chargebee_plan_id          TEXT,   -- e.g. 'starter-monthly-USD'
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id)
);

-- ── 3. Credit ledger (immutable audit log) ───────────────────
CREATE TABLE IF NOT EXISTS credit_ledger (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id  UUID    REFERENCES subscriptions(id),
  operation_type   TEXT    NOT NULL,
  -- 'enrichment'|'scoring'|'content_analysis'|'discovery'
  -- 'top_up'|'cycle_reset'|'trial_grant'|'plan_change'
  credits_delta    INTEGER NOT NULL,  -- negative = consumed, positive = granted
  lead_id          UUID,
  campaign_id      UUID,
  status           TEXT    NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('completed','failed','refunded')),
  metadata         JSONB   DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_workspace_idx
  ON credit_ledger (workspace_id, created_at DESC);

-- ── 4. Top-up packs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_top_ups (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credits                     INTEGER NOT NULL,
  price_cents                 INTEGER NOT NULL,
  expires_at                  TIMESTAMPTZ,
  chargebee_invoice_id        TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ── 5. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 6. Auto-create subscription on new workspace ─────────────
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
    150, 150
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 150, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_subscription ON workspaces;
CREATE TRIGGER on_workspace_created_subscription
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_workspace_subscription();

-- Backfill existing workspaces
INSERT INTO subscriptions (
  workspace_id, plan_id, billing_interval, status,
  current_period_start, current_period_end,
  credits_remaining, credits_total
)
SELECT w.id, 'basic', 'monthly', 'active',
       now(), now() + INTERVAL '30 days', 150, 150
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.workspace_id = w.id
)
ON CONFLICT (workspace_id) DO NOTHING;

-- ── 7. Atomic credit deduction (SECURITY DEFINER) ────────────
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
    UPDATE subscriptions SET status = 'canceled', updated_at = now()
    WHERE id = v_sub.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Trial expired');
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

-- ── 8. Cycle reset (called by Chargebee webhook) ─────────────
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

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle,
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));
END;
$$;

-- ── 9. RLS ───────────────────────────────────────────────────
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_top_ups     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read"              ON subscription_plans;
DROP POLICY IF EXISTS "subscriptions_workspace_read"   ON subscriptions;
DROP POLICY IF EXISTS "credit_ledger_workspace_read"   ON credit_ledger;
DROP POLICY IF EXISTS "credit_top_ups_workspace_read"  ON credit_top_ups;

CREATE POLICY "plans_public_read"
  ON subscription_plans FOR SELECT USING (true);

CREATE POLICY "subscriptions_workspace_read"
  ON subscriptions FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "credit_ledger_workspace_read"
  ON credit_ledger FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "credit_top_ups_workspace_read"
  ON credit_top_ups FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );
