-- ============================================================================
-- Clay-style custom AI columns for the Leads table. A saved column = a reusable
-- AI prompt (with {{field}} placeholders pulled from the lead's own data) that
-- gets run per-lead; the computed value is cached on the lead itself so it
-- renders instantly afterwards instead of re-calling the AI on every page view.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ai_column_definitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  prompt_template    TEXT NOT NULL,        -- e.g. "Guess the seniority level for {{full_name}} at {{company_name}}"
  output_type        TEXT NOT NULL DEFAULT 'text' CHECK (output_type IN ('text', 'number', 'email', 'url', 'boolean')),
  source_template_id TEXT,                 -- id from the static template library this was created from, if any
  column_order       INTEGER NOT NULL DEFAULT 0,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_column_definitions_workspace_idx ON ai_column_definitions(workspace_id, column_order);

DROP TRIGGER IF EXISTS set_updated_at ON ai_column_definitions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_column_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS auto_workspace_trigger ON ai_column_definitions;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON ai_column_definitions
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE ai_column_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_select_ai_column_definitions ON ai_column_definitions FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_insert_ai_column_definitions ON ai_column_definitions FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_update_ai_column_definitions ON ai_column_definitions FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_delete_ai_column_definitions ON ai_column_definitions FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());
