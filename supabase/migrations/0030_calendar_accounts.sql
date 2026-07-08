-- ============================================================================
-- LP-3 — Calendar connections. Stores per-workspace OAuth tokens for Google
-- Calendar and Microsoft (Graph) so we can read the user's free/busy and sync
-- availability automatically. Workspace-scoped via get_current_workspace_id()
-- and the set_workspace_from_user() trigger, matching outreach_accounts (0017).
--
-- Tokens are sensitive: rows are RLS-scoped to the owning workspace, and the
-- app reads token columns only server-side. The UI lists provider/email/status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email            TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, email)
);

CREATE INDEX IF NOT EXISTS calendar_accounts_workspace_idx ON calendar_accounts(workspace_id);

-- Auto-populate workspace_id on insert + workspace-scoped RLS (same helpers 0017 uses).
DROP TRIGGER IF EXISTS auto_workspace_trigger ON calendar_accounts;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON calendar_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE calendar_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_insert_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_update_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_delete_calendar_accounts ON calendar_accounts;
CREATE POLICY ws_select_calendar_accounts ON calendar_accounts FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_calendar_accounts ON calendar_accounts FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_calendar_accounts ON calendar_accounts FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_calendar_accounts ON calendar_accounts FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
