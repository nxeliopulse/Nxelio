-- ============================================================================
-- 0029 — Workspace subscriptions (the live subscription per tenant)
-- One LIVE subscription per workspace; cancelled rows kept for history.
-- Mirrors the Chargebee subscription. Read-only to users; written by webhooks
-- via the service role (createAdminClient), consistent with brevo/unipile.
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id                   UUID REFERENCES subscription_plans(id),
  -- Denormalized for fast feature-gate checks without a join.
  plan_code                 TEXT,
  chargebee_customer_id     TEXT,
  chargebee_subscription_id TEXT UNIQUE,
  -- Mirrors Chargebee subscription states.
  status                    TEXT NOT NULL DEFAULT 'trialing'
                              CHECK (status IN ('none','trialing','active','non_renewing','cancelled','past_due')),
  current_term_start        TIMESTAMPTZ,
  current_term_end          TIMESTAMPTZ,  -- renewal date shown in the dashboard
  trial_end                 TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_workspace_subscriptions_updated ON workspace_subscriptions;
CREATE TRIGGER trg_workspace_subscriptions_updated
  BEFORE UPDATE ON workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- At most ONE live subscription per workspace (cancelled rows excluded).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_sub_one_live
  ON workspace_subscriptions (workspace_id)
  WHERE status IN ('trialing','active','non_renewing','past_due');

CREATE INDEX IF NOT EXISTS idx_ws_sub_workspace ON workspace_subscriptions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_sub_cb_sub    ON workspace_subscriptions (chargebee_subscription_id);

-- Any member of the workspace may READ its subscription. No user writes:
-- all mutations flow Chargebee -> webhook -> service role.
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_sub_select ON workspace_subscriptions;
CREATE POLICY ws_sub_select ON workspace_subscriptions
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());
