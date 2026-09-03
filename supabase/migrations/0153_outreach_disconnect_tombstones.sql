-- ============================================================================
-- Fixes a real bug: clicking Disconnect on an Email/LinkedIn connection in
-- Settings deletes the local outreach_accounts row, but if the account is
-- still alive on Unipile's side (e.g. the DELETE call to Unipile failed
-- because the workspace's Unipile subscription lapsed — deleteOutreachAccount
-- swallows that failure and deletes locally anyway), the very next
-- window-focus-triggered syncOutreachAccounts() call sees that account still
-- listed by Unipile and silently re-inserts it as "connected" again. From the
-- user's side this looks exactly like "I click Disconnect and it doesn't
-- disconnect."
--
-- Fix: remember every account_id the user explicitly disconnected. sync skips
-- re-adding anything on this list. Starting a fresh Connect for that channel
-- clears the workspace's tombstones for that channel — explicit reconnect
-- intent always wins.
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_disconnected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id VARCHAR(255) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  disconnected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_disconnected_ws_channel ON outreach_disconnected_accounts(workspace_id, channel);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['outreach_disconnected_accounts']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_delete_%s ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;
