-- Picklist Manager — per-workspace editable dropdown values, replacing what
-- were previously hardcoded arrays duplicated across several files (Industries
-- was identical in 5 places, Company Size/Seniority in 2, Lead Status drifted
-- across 3 different vocabularies). Scoped to the 4 picklists confirmed to
-- have real duplication/drift; Deal Stages/Lead Source/Priority are out of
-- scope for this pass (see plan doc).
CREATE TABLE IF NOT EXISTS picklist_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          VARCHAR(50) NOT NULL,
  label        VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, key)
);
CREATE INDEX IF NOT EXISTS idx_picklist_categories_workspace ON picklist_categories(workspace_id);

CREATE TABLE IF NOT EXISTS picklist_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES picklist_categories(id) ON DELETE CASCADE,
  value       VARCHAR(150) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, value)
);
CREATE INDEX IF NOT EXISTS idx_picklist_values_category ON picklist_values(category_id, sort_order);

DROP TRIGGER IF EXISTS trg_picklist_values_updated ON picklist_values;
CREATE TRIGGER trg_picklist_values_updated BEFORE UPDATE ON picklist_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE picklist_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_insert_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_update_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_delete_picklist_categories ON picklist_categories;
CREATE POLICY ws_select_picklist_categories ON picklist_categories FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_picklist_categories ON picklist_categories FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_picklist_categories ON picklist_categories FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_picklist_categories ON picklist_categories FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- picklist_values has no workspace_id column of its own — scope through its
-- parent category instead.
ALTER TABLE picklist_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_insert_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_update_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_delete_picklist_values ON picklist_values;
CREATE POLICY ws_select_picklist_values ON picklist_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_picklist_values ON picklist_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_update_picklist_values ON picklist_values FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_picklist_values ON picklist_values FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));

-- Seeds the 5 categories + today's hardcoded defaults for one workspace —
-- shared by both the new-workspace trigger below and the one-time backfill,
-- so every workspace (existing or future) starts from the exact same values
-- currently baked into the app, and nothing changes visibly until an admin
-- edits them.
CREATE OR REPLACE FUNCTION seed_default_picklists_for_workspace(p_workspace_id UUID) RETURNS VOID AS $$
DECLARE
  cat_industry UUID;
  cat_interest UUID;
  cat_status UUID;
  cat_company_size UUID;
  cat_seniority UUID;
BEGIN
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_industry', 'Industries')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_industry;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_interest_area', 'Interest Areas')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_interest;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_status', 'Lead Status')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_status;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_company_size', 'Company Size')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_company_size;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_seniority', 'Seniority')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_seniority;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_industry, v, ord FROM unnest(ARRAY['Technology','Consulting','Enterprise Software','Analytics','Retail','Cloud Services','Manufacturing','Training','Healthcare','Finance']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_interest, v, ord FROM unnest(ARRAY['CRM Automation','SAP AI','Digital Transformation','AI Platforms','Customer Engagement','Workflow Automation','AI Personalization','Lead Nurturing','Lead Scoring']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order, is_system)
    SELECT cat_status, v, ord, (v = 'Converted') FROM unnest(ARRAY['New','Contacted','Qualified','Nurturing','Converted']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_company_size, v, ord FROM unnest(ARRAY['1-10','11-50','51-200','201-1000','1000+']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_seniority, v, ord FROM unnest(ARRAY['C-Level','VP','Director','Manager','Individual Contributor']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION seed_default_picklists_trigger_fn() RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_picklists_for_workspace(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS seed_default_picklists_trigger ON workspaces;
CREATE TRIGGER seed_default_picklists_trigger AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION seed_default_picklists_trigger_fn();

-- Backfill every workspace that already exists today.
DO $$
DECLARE ws RECORD;
BEGIN
  FOR ws IN SELECT id FROM workspaces LOOP
    PERFORM seed_default_picklists_for_workspace(ws.id);
  END LOOP;
END $$;
