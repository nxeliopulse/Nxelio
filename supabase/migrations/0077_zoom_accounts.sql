-- ============================================================================
-- Zoom OAuth connection — lets a workspace create real Zoom meetings (a stable
-- join_url shared by host and lead) instead of a placeholder link. Deliberately
-- a separate table from calendar_accounts: Zoom has no availability/busy-sync
-- concept in this app, it's purely for meeting creation, so it shouldn't be
-- swept into the calendar busy-sync loops.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zoom_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email            TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS zoom_accounts_workspace_idx ON zoom_accounts(workspace_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON zoom_accounts;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON zoom_accounts
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON zoom_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON zoom_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE zoom_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_insert_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_update_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_delete_zoom_accounts ON zoom_accounts;
CREATE POLICY ws_select_zoom_accounts ON zoom_accounts FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_zoom_accounts ON zoom_accounts FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_zoom_accounts ON zoom_accounts FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_zoom_accounts ON zoom_accounts FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
