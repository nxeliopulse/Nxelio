-- ============================================================================
-- Extends contact_notes (0094) with two real sub-features from the Notes
-- redesign: multiple file attachments per note, and threaded replies.
--
-- contact_notes.file_url/file_name are left in place (not dropped) so no
-- existing single-attachment data is lost — new uploads go into
-- contact_note_files instead, and any pre-existing single attachment is
-- backfilled into the new table below so it shows up the same way.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_note_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    UUID NOT NULL REFERENCES contact_notes(id) ON DELETE CASCADE,
  file_url   TEXT NOT NULL,
  file_name  TEXT,
  file_size  BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_note_files_note_idx ON contact_note_files(note_id);

ALTER TABLE contact_note_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_note_files ON contact_note_files;
DROP POLICY IF EXISTS ws_insert_contact_note_files ON contact_note_files;
DROP POLICY IF EXISTS ws_delete_contact_note_files ON contact_note_files;
CREATE POLICY ws_select_contact_note_files ON contact_note_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contact_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_contact_note_files ON contact_note_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contact_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_contact_note_files ON contact_note_files FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM contact_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));

-- Backfill: any note that already has a single file_url becomes its first row here.
INSERT INTO contact_note_files (note_id, file_url, file_name, created_at)
SELECT id, file_url, file_name, created_at FROM contact_notes WHERE file_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_note_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  note_id        UUID NOT NULL REFERENCES contact_notes(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_note_comments_note_idx ON contact_note_comments(note_id, created_at);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON contact_note_comments;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON contact_note_comments
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE contact_note_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_note_comments ON contact_note_comments;
DROP POLICY IF EXISTS ws_insert_contact_note_comments ON contact_note_comments;
DROP POLICY IF EXISTS ws_delete_contact_note_comments ON contact_note_comments;
CREATE POLICY ws_select_contact_note_comments ON contact_note_comments FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_contact_note_comments ON contact_note_comments FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_contact_note_comments ON contact_note_comments FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
