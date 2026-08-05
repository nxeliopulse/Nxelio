-- ============================================================================
-- Contact calls — a real call log per contact (outcome + notes + when),
-- filling in the "Calls" tab honestly. Same shape as contact_tasks (0098):
-- a simple, self-contained table, since no generic call-logging concept
-- exists anywhere else in this app yet.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  outcome        TEXT NOT NULL DEFAULT 'Connected' CHECK (outcome IN ('Connected', 'Busy', 'No Answer', 'Left Voicemail', 'Wrong Number')),
  notes          TEXT,
  call_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_calls_contact_idx ON contact_calls(contact_id, call_time DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON contact_calls;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON contact_calls
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE contact_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_calls ON contact_calls;
DROP POLICY IF EXISTS ws_insert_contact_calls ON contact_calls;
DROP POLICY IF EXISTS ws_update_contact_calls ON contact_calls;
DROP POLICY IF EXISTS ws_delete_contact_calls ON contact_calls;
CREATE POLICY ws_select_contact_calls ON contact_calls FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_contact_calls ON contact_calls FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_contact_calls ON contact_calls FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_contact_calls ON contact_calls FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
