-- ============================================================================
-- Multi-tenant workspaces — every signup creates a fresh tenant
-- Existing data is moved to a single "Legacy Workspace" so it doesn't vanish
-- ============================================================================

-- 1. Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- 2. Add workspace_id to every tenant-scoped table
ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segment_rules ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segment_members ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE newsletter_recipients ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE blocklist ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaign_template_steps ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE ai_prompt_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- 3. Helper: get current user's workspace_id (SECURITY DEFINER avoids recursion)
CREATE OR REPLACE FUNCTION get_current_workspace_id() RETURNS UUID AS $$
  SELECT workspace_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 4. Backfill: move all existing data into ONE "Legacy Workspace" so existing admins keep working
DO $$
DECLARE
  legacy_ws UUID;
  legacy_admin UUID;
BEGIN
  -- Find the original admin user
  SELECT user_id INTO legacy_admin FROM users WHERE role_id = 1 ORDER BY created_at LIMIT 1;

  -- Re-use existing workspace if any, else create
  SELECT id INTO legacy_ws FROM workspaces WHERE name = 'Legacy Workspace' LIMIT 1;
  IF legacy_ws IS NULL THEN
    INSERT INTO workspaces (name, owner_id) VALUES ('Legacy Workspace', legacy_admin)
    RETURNING id INTO legacy_ws;
  END IF;

  -- Set workspace_id on every existing row that doesn't have one
  UPDATE users               SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE leads               SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segments            SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segment_rules       SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segment_members     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE campaigns           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE workflows           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE workflow_executions SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE newsletters         SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE newsletter_recipients SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE email_templates     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE notifications       SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE blocklist           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE inbox_messages      SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE lead_activities     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE user_permissions    SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
END $$;

-- 5. Trigger: auto-fill workspace_id from current user's workspace on every INSERT
CREATE OR REPLACE FUNCTION set_workspace_from_user() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := get_current_workspace_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads','segments','segment_rules','segment_members',
    'campaigns','workflows','workflow_executions',
    'newsletters','newsletter_recipients','email_templates',
    'notifications','blocklist','inbox_messages','lead_activities','user_permissions'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);
  END LOOP;
END $$;

-- 6. Signup trigger: every new auth.users INSERT creates a workspace + Admin profile
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
BEGIN
  -- If a public.users row already exists (admin-invited), don't create a workspace
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- New workspace, owned by this user, and they become its Admin
  INSERT INTO workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user_with_workspace();

-- 7. Workspace RLS — users can read their own workspace
DROP POLICY IF EXISTS "Read own workspace" ON workspaces;
CREATE POLICY "Read own workspace" ON workspaces FOR SELECT TO authenticated
  USING (id = get_current_workspace_id());

DROP POLICY IF EXISTS "Owner updates workspace" ON workspaces;
CREATE POLICY "Owner updates workspace" ON workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

-- 8. Replace user RLS so admins only see their workspace
DROP POLICY IF EXISTS "Users read own profile or admin reads all" ON users;
CREATE POLICY "Workspace users readable by admin/manager" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() IN (1, 2))
  );

DROP POLICY IF EXISTS "Admin can update users, users update self" ON users;
CREATE POLICY "Admin updates workspace users; users update self" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1)
  );

DROP POLICY IF EXISTS "Admin can delete users" ON users;
CREATE POLICY "Admin deletes workspace users" ON users FOR DELETE
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1);

-- 9. Replace leads RLS — workspace + role-scoped
DROP POLICY IF EXISTS "Read scoped leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read all leads" ON leads;
CREATE POLICY "Workspace leads, role-scoped" ON leads FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin/Manager create leads" ON leads;
CREATE POLICY "Workspace insert leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Admin/Manager update leads" ON leads;
CREATE POLICY "Workspace update leads" ON leads FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admin/Manager delete leads" ON leads;
CREATE POLICY "Workspace delete leads" ON leads FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() IN (1, 2));

-- Public capture still allowed for anon but routes to the Legacy Workspace
DROP POLICY IF EXISTS "Anon can capture leads" ON leads;
DROP POLICY IF EXISTS "Anon can capture leads to default workspace" ON leads;
CREATE POLICY "Anon can capture leads to default workspace" ON leads FOR INSERT TO anon
  WITH CHECK (
    source IN ('Website Form', 'Public Capture Form', 'Embed Form')
    AND status = 'New'
  );

-- Auto-assign anon leads to Legacy Workspace (since trigger fires before policy)
CREATE OR REPLACE FUNCTION set_anon_lead_workspace() RETURNS TRIGGER AS $$
DECLARE legacy_ws UUID;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT id INTO legacy_ws FROM workspaces WHERE name = 'Legacy Workspace' LIMIT 1;
    NEW.workspace_id := legacy_ws;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Apply workspace-only RLS to remaining tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'segments','segment_rules','segment_members',
    'campaigns','campaign_templates','campaign_template_steps','ai_prompt_templates',
    'workflows','workflow_executions','sequences','sequence_steps',
    'newsletters','newsletter_recipients','email_templates',
    'blocklist','inbox_messages','lead_activities','user_permissions'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_update_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_update_%s ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_delete_%s ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;

-- Notifications: still per-user but ALSO workspace-scoped
DROP POLICY IF EXISTS ws_select_notifications ON notifications;
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications scoped" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_notifications ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications scoped" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
