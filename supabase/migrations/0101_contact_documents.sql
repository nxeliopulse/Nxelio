-- ============================================================================
-- Contact documents — a real document tracker (quotes/proposals/contracts you
-- already have, uploaded and tracked with a type/status/owner). No template
-- builder or PDF generation — this records documents that exist, it doesn't
-- create them. Fills the "Files" tab's document list honestly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  doc_type     TEXT NOT NULL DEFAULT 'Proposal' CHECK (doc_type IN ('Quote', 'Proposal', 'Contract', 'Other')),
  status       TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Viewed', 'Signed')),
  owner_id     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  file_url     TEXT NOT NULL,
  file_name    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_documents_contact_idx ON contact_documents(contact_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON contact_documents;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON contact_documents
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_documents ON contact_documents;
DROP POLICY IF EXISTS ws_insert_contact_documents ON contact_documents;
DROP POLICY IF EXISTS ws_update_contact_documents ON contact_documents;
DROP POLICY IF EXISTS ws_delete_contact_documents ON contact_documents;
CREATE POLICY ws_select_contact_documents ON contact_documents FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_contact_documents ON contact_documents FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_contact_documents ON contact_documents FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_contact_documents ON contact_documents FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-documents', 'contact-documents', true)
ON CONFLICT (id) DO NOTHING;
