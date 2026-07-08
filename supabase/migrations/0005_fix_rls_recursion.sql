-- ============================================================================
-- Fix RLS recursion: policies that query users from within users policy
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_role_id() RETURNS INT AS $$
  SELECT role_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Users
DROP POLICY IF EXISTS "Users read own profile or admin reads all" ON users;
CREATE POLICY "Users read own profile or admin reads all" ON users FOR SELECT
  USING (user_id = auth.uid() OR get_current_user_role_id() = 1);

DROP POLICY IF EXISTS "Admin can insert users" ON users;
CREATE POLICY "Admin can insert users" ON users FOR INSERT
  WITH CHECK (get_current_user_role_id() = 1 OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can update users, users update self" ON users;
CREATE POLICY "Admin can update users, users update self" ON users FOR UPDATE
  USING (user_id = auth.uid() OR get_current_user_role_id() = 1);

DROP POLICY IF EXISTS "Admin can delete users" ON users;
CREATE POLICY "Admin can delete users" ON users FOR DELETE
  USING (get_current_user_role_id() = 1);

-- Leads
DROP POLICY IF EXISTS "Admin/Manager create leads" ON leads;
CREATE POLICY "Admin/Manager create leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role_id() IN (1, 2));

DROP POLICY IF EXISTS "Admin/Manager update leads" ON leads;
CREATE POLICY "Admin/Manager update leads" ON leads FOR UPDATE TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Admin/Manager delete leads" ON leads;
CREATE POLICY "Admin/Manager delete leads" ON leads FOR DELETE TO authenticated
  USING (get_current_user_role_id() IN (1, 2));

-- Permissions
DROP POLICY IF EXISTS "Admin all on permissions" ON user_permissions;
CREATE POLICY "Admin all on permissions" ON user_permissions FOR ALL TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR user_id = auth.uid())
  WITH CHECK (get_current_user_role_id() IN (1, 2));
