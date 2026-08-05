-- ============================================================================
-- Contact tasks — lightweight per-contact task/reminder list (title, due date,
-- reminder lead-time, priority, assignee). New feature: this app has no
-- generic task system anywhere else, so this table is scoped to contacts
-- only, following the same shape/trigger/RLS template as contact_notes
-- (0094_contact_notes.sql) and lead_notes (0073_lead_notes.sql).
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  due_at       TIMESTAMPTZ,
  reminder     TEXT,
  priority     TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  assigned_to  UUID REFERENCES users(user_id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_tasks_contact_due_idx ON contact_tasks(contact_id, due_at);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON contact_tasks;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON contact_tasks
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS trg_contact_tasks_updated ON contact_tasks;
CREATE TRIGGER trg_contact_tasks_updated BEFORE UPDATE ON contact_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE contact_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_contact_tasks ON contact_tasks;
DROP POLICY IF EXISTS ws_insert_contact_tasks ON contact_tasks;
DROP POLICY IF EXISTS ws_update_contact_tasks ON contact_tasks;
DROP POLICY IF EXISTS ws_delete_contact_tasks ON contact_tasks;
CREATE POLICY ws_select_contact_tasks ON contact_tasks FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_contact_tasks ON contact_tasks FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_contact_tasks ON contact_tasks FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_contact_tasks ON contact_tasks FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
