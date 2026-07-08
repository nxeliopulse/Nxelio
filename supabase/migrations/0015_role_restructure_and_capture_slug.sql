-- ============================================================================
-- Role restructure: Super Admin / Sales Admin / Marketing Admin
-- Per-workspace public capture URL
-- ============================================================================

-- 1. Rename existing roles
UPDATE roles SET role_name = 'Super Admin',
                 role_description = 'Full access to the workspace including users, billing, and integrations.'
WHERE role_id = 1;

UPDATE roles SET role_name = 'Marketing Admin',
                 role_description = 'Access to segments, newsletters, templates, workflows, and analytics — no sales pipeline.'
WHERE role_id = 2;

UPDATE roles SET role_name = 'Sales Admin',
                 role_description = 'Access to leads, campaigns, inbox, workflows, and analytics — no marketing tools.'
WHERE role_id = 3;

-- 2. Add capture_slug to workspaces (used in public capture URL)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS capture_slug VARCHAR(64) UNIQUE;

-- Generate slugs for existing workspaces
CREATE OR REPLACE FUNCTION generate_capture_slug() RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Backfill slugs for any workspaces that don't have one
UPDATE workspaces SET capture_slug = generate_capture_slug() WHERE capture_slug IS NULL;

-- Trigger: auto-generate slug on new workspace insert
CREATE OR REPLACE FUNCTION set_workspace_slug() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capture_slug IS NULL THEN
    LOOP
      NEW.capture_slug := generate_capture_slug();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE capture_slug = NEW.capture_slug);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_workspace_slug_trigger ON workspaces;
CREATE TRIGGER set_workspace_slug_trigger BEFORE INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION set_workspace_slug();

-- 3. Allow anon to look up a workspace by slug (just so capture form can resolve it)
DROP POLICY IF EXISTS "Anon can read workspace by slug" ON workspaces;
CREATE POLICY "Anon can read workspace by slug" ON workspaces FOR SELECT TO anon
  USING (true);

-- 4. Helper: look up workspace_id from slug (used by capture insert)
CREATE OR REPLACE FUNCTION workspace_id_for_slug(slug TEXT) RETURNS UUID AS $$
  SELECT id FROM workspaces WHERE capture_slug = slug LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog;
