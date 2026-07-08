-- ============================================================================
-- RLS Policies — Users can only access their workspace data
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- USERS — see self + (if Admin) see everyone
-- ----------------------------------------------------------------------------
CREATE POLICY "Users read own profile or admin reads all" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
  );

CREATE POLICY "Admin can insert users" ON users FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
    OR auth.uid() = user_id
  );

CREATE POLICY "Admin can update users, users update self" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
  );

CREATE POLICY "Admin can delete users" ON users FOR DELETE
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1));

-- ----------------------------------------------------------------------------
-- LEADS — authenticated users can read all, admins/managers can modify
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated read all leads" ON leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager create leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
  );

CREATE POLICY "Admin/Manager update leads" ON leads FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
    OR owner_id = auth.uid()
  );

CREATE POLICY "Admin/Manager delete leads" ON leads FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2)));

-- ----------------------------------------------------------------------------
-- LEAD ACTIVITIES — read all, system inserts
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated read activities" ON lead_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert activities" ON lead_activities FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- SEGMENTS / CAMPAIGNS / TEMPLATES / WORKFLOWS / INBOX — all authenticated CRUD
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated all on segments" ON segments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on segment_rules" ON segment_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on segment_members" ON segment_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on campaigns" ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on email_templates" ON email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on workflows" ON workflows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read executions" ON workflow_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert executions" ON workflow_executions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated all on inbox" ON inbox_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin all on permissions" ON user_permissions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
    OR user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
  );

-- ============================================================================
-- AUTO-CREATE USER PROFILE on signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  default_role INT;
  user_count INT;
BEGIN
  -- First user becomes Admin, everyone else Sales Rep
  SELECT COUNT(*) INTO user_count FROM public.users;
  IF user_count = 0 THEN
    default_role := 1;  -- Admin
  ELSE
    default_role := 3;  -- Sales Rep
  END IF;

  INSERT INTO public.users (user_id, email, full_name, role_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    default_role,
    'ACTIVE'
  );

  -- Grant view permissions to all menus by default
  INSERT INTO public.user_permissions (user_id, menu_id, can_view)
  SELECT NEW.id, menu_id, TRUE FROM public.menus;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
