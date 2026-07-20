-- ============================================================================
-- AI columns, part 2 — "action" columns that call a real integration instead of
-- generating AI text. Today the only wired-up action is a real AnySite email
-- lookup (find_email_by_url), reusing the same integration already used by the
-- lead sidebar's "Find email" button. Also adds a workspace-level saved-template
-- library so a user's own column configs can be reused later, alongside the
-- static built-in template gallery.
-- ============================================================================

ALTER TABLE ai_column_definitions
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'ai_text' CHECK (action_type IN ('ai_text', 'anysite_email'));

CREATE TABLE IF NOT EXISTS ai_column_saved_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  prompt_template TEXT,                  -- null/empty for action columns that don't need one (e.g. anysite_email)
  output_type     TEXT NOT NULL DEFAULT 'text' CHECK (output_type IN ('text', 'number', 'email', 'url', 'boolean')),
  action_type     TEXT NOT NULL DEFAULT 'ai_text' CHECK (action_type IN ('ai_text', 'anysite_email')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_column_saved_templates_workspace_idx ON ai_column_saved_templates(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON ai_column_saved_templates;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON ai_column_saved_templates
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE ai_column_saved_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_select_ai_column_saved_templates ON ai_column_saved_templates FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_insert_ai_column_saved_templates ON ai_column_saved_templates FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_delete_ai_column_saved_templates ON ai_column_saved_templates FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());
