-- ============================================================================
-- Account calls — a real call log per account (outcome + notes + when),
-- mirroring contact_calls (0100) exactly but keyed to accounts instead of
-- contacts. Same shape: a simple, self-contained table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  outcome        TEXT NOT NULL DEFAULT 'Connected' CHECK (outcome IN ('Connected', 'Busy', 'No Answer', 'Left Voicemail', 'Wrong Number')),
  notes          TEXT,
  call_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_calls_account_idx ON account_calls(account_id, call_time DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON account_calls;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON account_calls
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE account_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_calls ON account_calls;
DROP POLICY IF EXISTS ws_insert_account_calls ON account_calls;
DROP POLICY IF EXISTS ws_update_account_calls ON account_calls;
DROP POLICY IF EXISTS ws_delete_account_calls ON account_calls;
CREATE POLICY ws_select_account_calls ON account_calls FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_account_calls ON account_calls FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_account_calls ON account_calls FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_account_calls ON account_calls FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- ============================================================================
-- Lets a meeting be scheduled against an Account, not only a Lead/Contact.
-- account_id is independent of lead_id/contact_id — a meeting can reference
-- any combination, or neither. Mirrors contact_id added in
-- 0097_meeting_contact_link.sql.
-- ============================================================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_account_idx ON meetings(account_id);
