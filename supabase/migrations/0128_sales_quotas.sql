-- ============================================================================
-- 0128_sales_quotas.sql
--
-- Phase 2 item: a real Target/Quota data model, unlocking Pipeline Coverage,
-- Quota Attainment, and Gap-to-Target on Revenue Analytics, plus a
-- Target/Attainment% column on the Team leaderboard. A quota is either
-- per-rep (user_id set) or a whole-workspace target (user_id NULL) for a
-- given period.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_quotas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(user_id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  target_amount  NUMERIC(14,2) NOT NULL CHECK (target_amount >= 0),
  quota_type     TEXT NOT NULL DEFAULT 'revenue' CHECK (quota_type IN ('revenue', 'pipeline')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_sales_quotas_workspace_period ON sales_quotas (workspace_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sales_quotas_user ON sales_quotas (user_id);

DROP TRIGGER IF EXISTS trg_sales_quotas_updated ON sales_quotas;
CREATE TRIGGER trg_sales_quotas_updated
  BEFORE UPDATE ON sales_quotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sales_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_quotas_read ON sales_quotas;
CREATE POLICY sales_quotas_read
  ON sales_quotas FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

-- Only Super Admins (role_id = 1, this app's existing admin check — see
-- getAnalyticsContext()'s isAdmin) may set targets for the team.
DROP POLICY IF EXISTS sales_quotas_admin_write ON sales_quotas;
CREATE POLICY sales_quotas_admin_write
  ON sales_quotas FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid() AND role_id = 1)
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid() AND role_id = 1)
  );
