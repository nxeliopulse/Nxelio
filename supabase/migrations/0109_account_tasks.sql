-- ============================================================================
-- Account tasks — lightweight per-account task/reminder list (title, due date,
-- reminder lead-time, priority, assignee). Mirrors contact_tasks
-- (0098_contact_tasks.sql) exactly, just keyed to accounts instead of
-- contacts, following the same shape/trigger/RLS template as account_notes
-- (0108_account_notes.sql).
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS account_tasks_account_due_idx ON account_tasks(account_id, due_at);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON account_tasks;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON account_tasks
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS trg_account_tasks_updated ON account_tasks;
CREATE TRIGGER trg_account_tasks_updated BEFORE UPDATE ON account_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE account_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_account_tasks ON account_tasks;
DROP POLICY IF EXISTS ws_insert_account_tasks ON account_tasks;
DROP POLICY IF EXISTS ws_update_account_tasks ON account_tasks;
DROP POLICY IF EXISTS ws_delete_account_tasks ON account_tasks;
CREATE POLICY ws_select_account_tasks ON account_tasks FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_account_tasks ON account_tasks FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_account_tasks ON account_tasks FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_account_tasks ON account_tasks FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
