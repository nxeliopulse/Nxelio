-- ============================================================================
-- Lead import archive — a permanent record of every lead ever imported into a
-- workspace (CSV, LinkedIn search, Buy Leads, etc.), tied to the workspace and
-- the user who imported it. Unlike the working `leads` table, rows here are
-- NEVER deleted when the corresponding lead is deleted from `leads` — instead
-- `deleted_from_leads_at` is stamped so there's a durable record that the
-- import happened even after the lead itself is gone. See Privacy Policy
-- Section 7 for the corresponding disclosure.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_import_archive (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  imported_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_by_name      TEXT,
  source                TEXT,                 -- e.g. "Buy Leads", "CSV Upload", "LinkedIn Search"
  original_lead_id      UUID,                  -- points at leads.id; NOT a FK (row may later be deleted)
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  company_name          TEXT,
  industry              TEXT,
  interest_area         TEXT,
  linkedin              TEXT,
  website_url           TEXT,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_from_leads_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS lead_import_archive_workspace_idx ON lead_import_archive(workspace_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS lead_import_archive_original_lead_idx ON lead_import_archive(original_lead_id);

ALTER TABLE lead_import_archive ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may archive an entry for their own workspace — the app
-- writes via the admin client in practice, this is defense-in-depth only.
DROP POLICY IF EXISTS ws_insert_lead_import_archive ON lead_import_archive;
CREATE POLICY ws_insert_lead_import_archive ON lead_import_archive FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

-- A workspace's own Super Admin can view its archive.
DROP POLICY IF EXISTS admin_select_lead_import_archive ON lead_import_archive;
CREATE POLICY admin_select_lead_import_archive ON lead_import_archive FOR SELECT TO authenticated
  USING (get_current_user_role_id() = 1 AND workspace_id = get_current_workspace_id());

-- Only the "deleted_from_leads_at" stamp may be updated (by the app's admin client) — no other mutation, no delete.
DROP POLICY IF EXISTS ws_update_lead_import_archive ON lead_import_archive;
CREATE POLICY ws_update_lead_import_archive ON lead_import_archive FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id())
  WITH CHECK (workspace_id = get_current_workspace_id());

-- Deliberately no DELETE policy — archive rows are permanent.
