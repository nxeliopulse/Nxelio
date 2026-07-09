-- ============================================================================
-- 0027 — Subscription plan catalog (recurring plans + one-time top-ups)
-- Part of the Subscription System. Additive only — touches no existing tables.
--
-- A single "catalog" table holds BOTH recurring plans (Basic/Starter/Pro) and
-- one-time credit top-ups, distinguished by `kind`. This lets the billing UI
-- query one source of truth for everything purchasable.
-- ============================================================================

-- 1. Catalog table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key used in app logic & feature_access joins. Never shown raw.
  code                     TEXT UNIQUE NOT NULL,
  -- 'plan' = recurring subscription, 'topup' = one-time credit pack.
  kind                     TEXT NOT NULL DEFAULT 'plan'
                             CHECK (kind IN ('plan', 'topup')),
  name                     TEXT NOT NULL,
  -- Chargebee Item Price id (Product Catalog 2.0). Filled when CB items exist;
  -- nullable so seeds work before the Chargebee site is configured.
  chargebee_item_price_id  TEXT,
  -- Money stored as integer cents to avoid floating-point rounding errors.
  price_cents              INT  NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  -- For 'plan': credits granted each billing cycle.
  -- For 'topup': credits added once on purchase.
  monthly_credits          INT  NOT NULL DEFAULT 0,
  -- Free-trial length in days (Basic = 7). 0 = no trial.
  trial_days               INT  NOT NULL DEFAULT 0,
  -- Display ordering on the pricing UI.
  sort_order               INT  NOT NULL DEFAULT 0,
  -- Soft-disable a plan without deleting it (keeps historical FK references valid).
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at fresh using the helper defined in 0001_initial_schema.sql.
DROP TRIGGER IF EXISTS trg_subscription_plans_updated ON subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fast lookup of the active plans the UI lists, in display order.
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON subscription_plans (kind, sort_order) WHERE is_active;

-- 2. Row Level Security ------------------------------------------------------
-- Pricing is non-sensitive reference data: any signed-in user may read it.
-- No user-facing writes — the catalog is managed by migrations / service role.
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_select_authenticated ON subscription_plans;
CREATE POLICY sp_select_authenticated ON subscription_plans
  FOR SELECT TO authenticated USING (TRUE);

-- 3. Seed the catalog (idempotent via UNIQUE(code) upsert) -------------------
-- Recurring plans. price_cents: $8.99 / $59 / $139. Credits: 150 / 1000 / 2500.
INSERT INTO subscription_plans
  (code, kind, name, chargebee_item_price_id, price_cents, monthly_credits, trial_days, sort_order)
VALUES
  ('basic',   'plan', 'Basic',   'plan-basic-USD-monthly',    899, 150, 7, 1),
  ('starter', 'plan', 'Starter', 'plan-starter-USD-monthly', 5900, 1000, 0, 2),
  ('pro',     'plan', 'Pro',     'plan-pro-USD-monthly',    13900, 2500, 0, 3)
ON CONFLICT (code) DO UPDATE SET
  name                    = EXCLUDED.name,
  chargebee_item_price_id = EXCLUDED.chargebee_item_price_id,
  price_cents             = EXCLUDED.price_cents,
  monthly_credits         = EXCLUDED.monthly_credits,
  trial_days              = EXCLUDED.trial_days,
  sort_order              = EXCLUDED.sort_order,
  is_active               = TRUE;

-- One-time top-ups. price_cents: $9 / $15 / $59. Credits never expire.
INSERT INTO subscription_plans
  (code, kind, name, chargebee_item_price_id, price_cents, monthly_credits, trial_days, sort_order)
VALUES
  ('topup-500',  'topup', '500 Credits',   'topup-500-USD',    900,  500, 0, 10),
  ('topup-1000', 'topup', '1,000 Credits', 'topup-1000-USD',  1500, 1000, 0, 11),
  ('topup-5000', 'topup', '5,000 Credits', 'topup-5000-USD',  5900, 5000, 0, 12)
ON CONFLICT (code) DO UPDATE SET
  name                    = EXCLUDED.name,
  chargebee_item_price_id = EXCLUDED.chargebee_item_price_id,
  price_cents             = EXCLUDED.price_cents,
  monthly_credits         = EXCLUDED.monthly_credits,
  sort_order              = EXCLUDED.sort_order,
  is_active               = TRUE;
