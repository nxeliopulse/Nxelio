-- ============================================================================
-- Lead notes — free-text notes (optionally with one attached file) a user can
-- log against a lead, shown on the lead detail page's "Notes" panel. Replaces
-- the earlier Salesforce-mirrored "Files" placeholder with something that
-- actually exists in this app: a per-lead note log, not a generic file store.
--
-- "History" (who created/last modified a lead) doesn't need a new table —
-- it's answered from data that already exists: leads.owner_id + created_at
-- for "Created By", and the existing audit_log's "lead.updated" entries
-- (already recorded by updateLead()) for "Last Modified By".
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  file_url       TEXT,
  file_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON lead_notes(lead_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON lead_notes;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_lead_notes ON lead_notes;
DROP POLICY IF EXISTS ws_insert_lead_notes ON lead_notes;
DROP POLICY IF EXISTS ws_delete_lead_notes ON lead_notes;
CREATE POLICY ws_select_lead_notes ON lead_notes FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_lead_notes ON lead_notes FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_lead_notes ON lead_notes FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- Public bucket for note attachments — matches the existing newsletter-images
-- bucket convention (uploaded via the admin client server-side, never exposed
-- to client-side direct upload).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-notes', 'lead-notes', true)
ON CONFLICT (id) DO NOTHING;
