-- ============================================================================
-- 0030 — Credit wallet (one balance per workspace)
-- Replaces the approximation in src/lib/queries/credits.ts with a real wallet.
-- Two buckets: monthly (resets each cycle) and topup (never expires).
-- remaining = (monthly_allowance - monthly_used) + topup_balance
-- Balances are mutated ONLY via SECURITY DEFINER RPCs (added in 0031), never
-- by direct client writes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_wallet (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  monthly_allowance INT NOT NULL DEFAULT 0,   -- plan credits for the cycle
  monthly_used      INT NOT NULL DEFAULT 0,   -- consumed this cycle
  topup_balance     INT NOT NULL DEFAULT 0,   -- purchased credits, roll over
  cycle_start       TIMESTAMPTZ,
  cycle_end         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_wallet_monthly_used_nonneg CHECK (monthly_used >= 0),
  CONSTRAINT credit_wallet_topup_nonneg        CHECK (topup_balance >= 0)
);

DROP TRIGGER IF EXISTS trg_credit_wallet_updated ON credit_wallet;
CREATE TRIGGER trg_credit_wallet_updated
  BEFORE UPDATE ON credit_wallet
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Members of the workspace may READ the balance. No user writes.
ALTER TABLE credit_wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cw_select ON credit_wallet;
CREATE POLICY cw_select ON credit_wallet
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());
