-- ============================================================================
-- Extends contact_documents (0101) with the "Create New File" redesign:
-- Deal link, typed Content (alternative to file upload), and a MANUAL
-- signed-tracking flow — NOT a real e-signature integration. No third-party
-- e-signature provider is connected, so this only records that someone marked
-- the document signed and by whom/when — it is not legally binding. A real
-- e-signature integration (DocuSign/Dropbox Sign/etc.) would need its own
-- migration once a provider + API credentials are chosen.
-- ============================================================================

ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contact_documents ALTER COLUMN file_url DROP NOT NULL;
CREATE INDEX IF NOT EXISTS contact_documents_opportunity_idx ON contact_documents(opportunity_id);

CREATE TABLE IF NOT EXISTS contact_document_recipients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES contact_documents(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  signed       BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_document_recipients_doc_idx ON contact_document_recipients(document_id);

ALTER TABLE contact_document_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_document_recipients ON contact_document_recipients;
DROP POLICY IF EXISTS ws_insert_contact_document_recipients ON contact_document_recipients;
DROP POLICY IF EXISTS ws_update_contact_document_recipients ON contact_document_recipients;
DROP POLICY IF EXISTS ws_delete_contact_document_recipients ON contact_document_recipients;
CREATE POLICY ws_select_contact_document_recipients ON contact_document_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contact_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_contact_document_recipients ON contact_document_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contact_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_update_contact_document_recipients ON contact_document_recipients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM contact_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_contact_document_recipients ON contact_document_recipients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM contact_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
