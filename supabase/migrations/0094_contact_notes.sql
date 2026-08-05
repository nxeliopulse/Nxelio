-- ============================================================================
-- Contact notes — same shape as lead_notes (0073_lead_notes.sql), just keyed
-- to contacts instead of leads. Backs the Contact detail page's "Notes" panel.
-- Reuses the same storage-bucket convention (uploaded server-side via the
-- admin client, never exposed to client-side direct upload).
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  file_url       TEXT,
  file_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_notes_contact_idx ON contact_notes(contact_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON contact_notes;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_notes ON contact_notes;
DROP POLICY IF EXISTS ws_insert_contact_notes ON contact_notes;
DROP POLICY IF EXISTS ws_delete_contact_notes ON contact_notes;
CREATE POLICY ws_select_contact_notes ON contact_notes FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_contact_notes ON contact_notes FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_contact_notes ON contact_notes FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-notes', 'contact-notes', true)
ON CONFLICT (id) DO NOTHING;
