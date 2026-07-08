-- ============================================================================
-- 0031 — Credit ledger + atomic credit RPCs + workspace auto-provisioning
--
-- This migration adds:
--   (A) credit_transactions   — immutable, idempotent ledger
--   (B) consume_credits()     — atomic deduct (monthly first, then topup)
--   (C) refund_credits()      — reverse a debit (failed jobs)
--   (D) grant_monthly_credits / add_topup_credits — used by the webhook
--   (E) provision_workspace_billing() + trigger — new workspace => Basic trial
--
-- All mutating functions are SECURITY DEFINER and REVOKE'd from PUBLIC, so they
-- can only be called by the service role (createAdminClient) — a client can
-- never call them with an arbitrary workspace_id to drain credits.
-- ============================================================================

-- (A) Immutable ledger -------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  wallet_id       UUID NOT NULL REFERENCES credit_wallet(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('grant','topup','debit','refund','reset')),
  amount          INT  NOT NULL,                 -- signed: + credit, - debit
  balance_after   INT  NOT NULL,                 -- total remaining snapshot
  bucket          TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (bucket IN ('monthly','topup','mixed')),
  feature_key     TEXT,                           -- which feature consumed it
  reference_type  TEXT,                           -- e.g. 'lead','invoice'
  reference_id    UUID,
  -- The double-charge guard: same key twice = no-op.
  idempotency_key TEXT UNIQUE,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_workspace ON credit_transactions (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_wallet    ON credit_transactions (wallet_id, created_at DESC);

-- Workspace members may READ their history; inserts only via the RPCs below.
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ct_select ON credit_transactions;
CREATE POLICY ct_select ON credit_transactions
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- (B) consume_credits — atomic, idempotent deduction ------------------------
CREATE OR REPLACE FUNCTION consume_credits(
  p_workspace_id    UUID,
  p_feature         TEXT,
  p_cost            INT,
  p_idempotency_key TEXT,
  p_reference_type  TEXT DEFAULT NULL,
  p_reference_id    UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  w                   credit_wallet%ROWTYPE;
  v_monthly_remaining INT;
  v_total             INT;
  v_from_monthly      INT;
  v_from_topup        INT;
  v_balance_after     INT;
BEGIN
  IF p_cost <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

  -- Idempotency: already processed -> succeed without charging again.
  IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Lock the wallet row so concurrent calls serialize (no double-spend).
  SELECT * INTO w FROM credit_wallet WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_wallet');
  END IF;

  v_monthly_remaining := GREATEST(w.monthly_allowance - w.monthly_used, 0);
  v_total := v_monthly_remaining + w.topup_balance;

  IF v_total < p_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits',
                              'remaining', v_total, 'required', p_cost);
  END IF;

  -- Spend monthly allowance first, then top-up balance.
  v_from_monthly := LEAST(v_monthly_remaining, p_cost);
  v_from_topup   := p_cost - v_from_monthly;

  UPDATE credit_wallet
     SET monthly_used  = monthly_used + v_from_monthly,
         topup_balance = topup_balance - v_from_topup,
         updated_at    = now()
   WHERE id = w.id;

  v_balance_after := v_total - p_cost;

  INSERT INTO credit_transactions
    (workspace_id, wallet_id, type, amount, balance_after, bucket,
     feature_key, reference_type, reference_id, idempotency_key, metadata)
  VALUES
    (p_workspace_id, w.id, 'debit', -p_cost, v_balance_after,
     CASE WHEN v_from_topup = 0 THEN 'monthly'
          WHEN v_from_monthly = 0 THEN 'topup'
          ELSE 'mixed' END,
     p_feature, p_reference_type, p_reference_id, p_idempotency_key,
     jsonb_build_object('from_monthly', v_from_monthly, 'from_topup', v_from_topup));

  RETURN jsonb_build_object('ok', true, 'charged', p_cost, 'remaining', v_balance_after);
END;
$$;

-- (C) refund_credits — reverse a prior debit (e.g. AI job failed) ------------
CREATE OR REPLACE FUNCTION refund_credits(
  p_idempotency_key TEXT,
  p_reason          TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  d              credit_transactions%ROWTYPE;
  w              credit_wallet%ROWTYPE;
  v_from_monthly INT;
  v_from_topup   INT;
  v_total        INT;
BEGIN
  -- Already refunded -> no-op.
  IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key || ':refund') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  SELECT * INTO d FROM credit_transactions
   WHERE idempotency_key = p_idempotency_key AND type = 'debit' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_debit');
  END IF;

  SELECT * INTO w FROM credit_wallet WHERE id = d.wallet_id FOR UPDATE;

  v_from_monthly := COALESCE((d.metadata->>'from_monthly')::INT, 0);
  v_from_topup   := COALESCE((d.metadata->>'from_topup')::INT, 0);

  UPDATE credit_wallet
     SET monthly_used  = GREATEST(monthly_used - v_from_monthly, 0),
         topup_balance = topup_balance + v_from_topup,
         updated_at    = now()
   WHERE id = w.id;

  SELECT GREATEST(monthly_allowance - monthly_used, 0) + topup_balance
    INTO v_total FROM credit_wallet WHERE id = w.id;

  INSERT INTO credit_transactions
    (workspace_id, wallet_id, type, amount, balance_after, bucket,
     feature_key, reference_type, reference_id, idempotency_key, metadata)
  VALUES
    (d.workspace_id, w.id, 'refund', -d.amount, v_total, 'mixed',
     d.feature_key, d.reference_type, d.reference_id, p_idempotency_key || ':refund',
     jsonb_build_object('reason', p_reason, 'refunds', p_idempotency_key));

  RETURN jsonb_build_object('ok', true, 'refunded', -d.amount);
END;
$$;

-- (D) grant_monthly_credits — webhook on subscription start / renewal --------
CREATE OR REPLACE FUNCTION grant_monthly_credits(
  p_workspace_id    UUID,
  p_amount          INT,
  p_term_start      TIMESTAMPTZ,
  p_term_end        TIMESTAMPTZ,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  w       credit_wallet%ROWTYPE;
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  SELECT * INTO w FROM credit_wallet WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO credit_wallet (workspace_id, monthly_allowance, monthly_used, topup_balance, cycle_start, cycle_end)
    VALUES (p_workspace_id, p_amount, 0, 0, p_term_start, p_term_end)
    RETURNING * INTO w;
  ELSE
    -- Renewal resets the monthly bucket; top-up balance is untouched.
    UPDATE credit_wallet
       SET monthly_allowance = p_amount,
           monthly_used      = 0,
           cycle_start       = p_term_start,
           cycle_end         = p_term_end,
           updated_at        = now()
     WHERE id = w.id
    RETURNING * INTO w;
  END IF;

  v_total := GREATEST(w.monthly_allowance - w.monthly_used, 0) + w.topup_balance;

  INSERT INTO credit_transactions
    (workspace_id, wallet_id, type, amount, balance_after, bucket, idempotency_key, metadata)
  VALUES
    (p_workspace_id, w.id, 'grant', p_amount, v_total, 'monthly', p_idempotency_key,
     jsonb_build_object('reason', 'renewal'));

  RETURN jsonb_build_object('ok', true, 'granted', p_amount);
END;
$$;

-- (D) add_topup_credits — webhook on one-time top-up purchase ----------------
CREATE OR REPLACE FUNCTION add_topup_credits(
  p_workspace_id    UUID,
  p_amount          INT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  w       credit_wallet%ROWTYPE;
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  SELECT * INTO w FROM credit_wallet WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_wallet');
  END IF;

  UPDATE credit_wallet
     SET topup_balance = topup_balance + p_amount, updated_at = now()
   WHERE id = w.id
  RETURNING * INTO w;

  v_total := GREATEST(w.monthly_allowance - w.monthly_used, 0) + w.topup_balance;

  INSERT INTO credit_transactions
    (workspace_id, wallet_id, type, amount, balance_after, bucket, idempotency_key, metadata)
  VALUES
    (p_workspace_id, w.id, 'topup', p_amount, v_total, 'topup', p_idempotency_key,
     jsonb_build_object('reason', 'topup_purchase'));

  RETURN jsonb_build_object('ok', true, 'added', p_amount);
END;
$$;

-- (E) Auto-provision a new workspace onto the Basic 7-day trial --------------
-- Creates the subscription row + wallet + initial credit grant in one shot.
-- Idempotent (skips if already provisioned). Reused for backfill below.
CREATE OR REPLACE FUNCTION provision_workspace_billing(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_plan      subscription_plans%ROWTYPE;
  v_wallet_id UUID;
  v_now       TIMESTAMPTZ := now();
  v_trial_end TIMESTAMPTZ;
BEGIN
  IF EXISTS (SELECT 1 FROM workspace_subscriptions WHERE workspace_id = p_workspace_id) THEN
    RETURN;  -- already provisioned
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE code = 'basic' LIMIT 1;
  IF NOT FOUND THEN
    RETURN;  -- catalog not seeded yet; nothing to do
  END IF;

  v_trial_end := v_now + (v_plan.trial_days || ' days')::interval;

  INSERT INTO workspace_subscriptions
    (workspace_id, plan_id, plan_code, status, current_term_start, current_term_end, trial_end)
  VALUES
    (p_workspace_id, v_plan.id, v_plan.code, 'trialing', v_now, v_trial_end, v_trial_end);

  INSERT INTO credit_wallet
    (workspace_id, monthly_allowance, monthly_used, topup_balance, cycle_start, cycle_end)
  VALUES
    (p_workspace_id, v_plan.monthly_credits, 0, 0, v_now, v_trial_end)
  RETURNING id INTO v_wallet_id;

  INSERT INTO credit_transactions
    (workspace_id, wallet_id, type, amount, balance_after, bucket, idempotency_key, metadata)
  VALUES
    (p_workspace_id, v_wallet_id, 'grant', v_plan.monthly_credits, v_plan.monthly_credits,
     'monthly', 'provision:' || p_workspace_id,
     jsonb_build_object('reason', 'trial_start', 'plan', 'basic'));
END;
$$;

-- Trigger: every new workspace gets billing provisioned automatically.
-- Separate AFTER INSERT trigger — does NOT modify the existing signup logic.
CREATE OR REPLACE FUNCTION trg_provision_workspace_billing()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  PERFORM provision_workspace_billing(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provision_billing_trigger ON workspaces;
CREATE TRIGGER provision_billing_trigger
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION trg_provision_workspace_billing();

-- Backfill existing workspaces (e.g. the Legacy Workspace) onto the trial.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM workspaces LOOP
    PERFORM provision_workspace_billing(r.id);
  END LOOP;
END $$;

-- Lock down mutating functions: service role only (clients must go through
-- server actions that use createAdminClient).
REVOKE ALL ON FUNCTION consume_credits(UUID, TEXT, INT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION refund_credits(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_monthly_credits(UUID, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_topup_credits(UUID, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION provision_workspace_billing(UUID) FROM PUBLIC;
