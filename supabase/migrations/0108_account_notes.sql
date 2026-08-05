-- ============================================================================
-- Account notes — same shape as contact_notes (0094/0099/0106 combined), just
-- keyed to accounts instead of contacts. Backs the Account detail page's
-- "Notes" panel. Reuses the same storage-bucket convention (uploaded
-- server-side via the admin client, never exposed to client-side direct
-- upload), multi-file attachments, threaded replies, and a Title column.
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  title          TEXT,
  body           TEXT NOT NULL,
  file_url       TEXT,
  file_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_notes_account_idx ON account_notes(account_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON account_notes;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON account_notes
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_notes ON account_notes;
DROP POLICY IF EXISTS ws_insert_account_notes ON account_notes;
DROP POLICY IF EXISTS ws_delete_account_notes ON account_notes;
CREATE POLICY ws_select_account_notes ON account_notes FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_account_notes ON account_notes FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_account_notes ON account_notes FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

INSERT INTO storage.buckets (id, name, public)
VALUES ('account-notes', 'account-notes', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_note_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    UUID NOT NULL REFERENCES account_notes(id) ON DELETE CASCADE,
  file_url   TEXT NOT NULL,
  file_name  TEXT,
  file_size  BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_note_files_note_idx ON account_note_files(note_id);

ALTER TABLE account_note_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_note_files ON account_note_files;
DROP POLICY IF EXISTS ws_insert_account_note_files ON account_note_files;
DROP POLICY IF EXISTS ws_delete_account_note_files ON account_note_files;
CREATE POLICY ws_select_account_note_files ON account_note_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM account_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_account_note_files ON account_note_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM account_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_account_note_files ON account_note_files FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_notes n WHERE n.id = note_id AND n.workspace_id = get_current_workspace_id()));

-- Backfill: any note that already has a single file_url becomes its first row here.
INSERT INTO account_note_files (note_id, file_url, file_name, created_at)
SELECT id, file_url, file_name, created_at FROM account_notes WHERE file_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_note_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  note_id        UUID NOT NULL REFERENCES account_notes(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_note_comments_note_idx ON account_note_comments(note_id, created_at);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON account_note_comments;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON account_note_comments
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE account_note_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_note_comments ON account_note_comments;
DROP POLICY IF EXISTS ws_insert_account_note_comments ON account_note_comments;
DROP POLICY IF EXISTS ws_delete_account_note_comments ON account_note_comments;
CREATE POLICY ws_select_account_note_comments ON account_note_comments FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_account_note_comments ON account_note_comments FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_account_note_comments ON account_note_comments FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
