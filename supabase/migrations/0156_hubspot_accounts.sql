-- ============================================================================
-- HubSpot OAuth connection — one per workspace. Each workspace connects its
-- OWN HubSpot account (public OAuth app), replacing the earlier single
-- shared HUBSPOT_API_KEY. Mirrors zoom_accounts (0077): plain-text tokens
-- protected by RLS + server-only reads, lazy refresh before each use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hubspot_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  portal_id        TEXT,
  hub_domain       TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS hubspot_accounts_workspace_idx ON hubspot_accounts(workspace_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON hubspot_accounts;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON hubspot_accounts
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON hubspot_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hubspot_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hubspot_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_hubspot_accounts ON hubspot_accounts;
DROP POLICY IF EXISTS ws_insert_hubspot_accounts ON hubspot_accounts;
DROP POLICY IF EXISTS ws_update_hubspot_accounts ON hubspot_accounts;
DROP POLICY IF EXISTS ws_delete_hubspot_accounts ON hubspot_accounts;
CREATE POLICY ws_select_hubspot_accounts ON hubspot_accounts FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_hubspot_accounts ON hubspot_accounts FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_hubspot_accounts ON hubspot_accounts FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_hubspot_accounts ON hubspot_accounts FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
