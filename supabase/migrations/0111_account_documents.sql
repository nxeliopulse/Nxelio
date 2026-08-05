-- ============================================================================
-- Account documents — a real document tracker (quotes/proposals/contracts you
-- already have, uploaded and tracked with a type/status/owner), mirroring
-- contact_documents (0101 + 0107) but keyed to accounts instead of contacts.
-- No template builder or PDF generation — this records documents that exist,
-- it doesn't create them. Includes the "Create New File" shape directly
-- (Deal link, typed Content as an alternative to file upload, and a MANUAL
-- signed-tracking flow) since there's no earlier account_documents revision
-- to layer this on top of — this is the final combined shape in one
-- migration, matching contact_documents after both 0101 and 0107 applied.
--
-- The signed-tracking flow is NOT a real e-signature integration. No
-- third-party e-signature provider is connected, so this only records that
-- someone marked the document signed and by whom/when — it is not legally
-- binding. A real e-signature integration (DocuSign/Dropbox Sign/etc.) would
-- need its own migration once a provider + API credentials are chosen.
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  opportunity_id      UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  doc_type            TEXT NOT NULL DEFAULT 'Proposal' CHECK (doc_type IN ('Quote', 'Proposal', 'Contract', 'Other')),
  status              TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Viewed', 'Signed')),
  owner_id            UUID REFERENCES users(user_id) ON DELETE SET NULL,
  file_url            TEXT,
  file_name           TEXT,
  content             TEXT,
  signature_required  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_documents_account_idx ON account_documents(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_documents_opportunity_idx ON account_documents(opportunity_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON account_documents;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON account_documents
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE account_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_documents ON account_documents;
DROP POLICY IF EXISTS ws_insert_account_documents ON account_documents;
DROP POLICY IF EXISTS ws_update_account_documents ON account_documents;
DROP POLICY IF EXISTS ws_delete_account_documents ON account_documents;
CREATE POLICY ws_select_account_documents ON account_documents FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_account_documents ON account_documents FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_account_documents ON account_documents FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_account_documents ON account_documents FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

INSERT INTO storage.buckets (id, name, public)
VALUES ('account-documents', 'account-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_document_recipients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES account_documents(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  signed       BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_document_recipients_doc_idx ON account_document_recipients(document_id);

ALTER TABLE account_document_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_document_recipients ON account_document_recipients;
DROP POLICY IF EXISTS ws_insert_account_document_recipients ON account_document_recipients;
DROP POLICY IF EXISTS ws_update_account_document_recipients ON account_document_recipients;
DROP POLICY IF EXISTS ws_delete_account_document_recipients ON account_document_recipients;
CREATE POLICY ws_select_account_document_recipients ON account_document_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM account_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_account_document_recipients ON account_document_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM account_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_update_account_document_recipients ON account_document_recipients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_account_document_recipients ON account_document_recipients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_documents d WHERE d.id = document_id AND d.workspace_id = get_current_workspace_id()));
