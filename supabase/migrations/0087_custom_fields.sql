-- Custom Field Definitions — per-workspace dynamic field schema storage
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_type  VARCHAR(50) NOT NULL, -- lead, account, contact, opportunity
  name         VARCHAR(100) NOT NULL,
  label        VARCHAR(100) NOT NULL,
  type         VARCHAR(50) NOT NULL DEFAULT 'text',
  required     BOOLEAN NOT NULL DEFAULT false,
  read_only    BOOLEAN NOT NULL DEFAULT false,
  options      JSONB DEFAULT '[]'::jsonb,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, object_type, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_workspace_object ON custom_field_definitions(workspace_id, object_type);

DROP TRIGGER IF EXISTS trg_custom_field_definitions_updated ON custom_field_definitions;
CREATE TRIGGER trg_custom_field_definitions_updated BEFORE UPDATE ON custom_field_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_custom_field_definitions ON custom_field_definitions;
DROP POLICY IF EXISTS ws_insert_custom_field_definitions ON custom_field_definitions;
DROP POLICY IF EXISTS ws_update_custom_field_definitions ON custom_field_definitions;
DROP POLICY IF EXISTS ws_delete_custom_field_definitions ON custom_field_definitions;

CREATE POLICY ws_select_custom_field_definitions ON custom_field_definitions FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_custom_field_definitions ON custom_field_definitions FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_custom_field_definitions ON custom_field_definitions FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_custom_field_definitions ON custom_field_definitions FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
