-- Fix: workspace-scoped RLS policies still used the pre-restructure role IDs
-- (IN (1, 2) = old Admin/Manager). After migration 0015:
--   1 = Super Admin, 2 = Marketing Admin, 3 = Sales Admin.
-- This shut Sales Admin (role 3) out of leads, campaigns, newsletters, etc.
-- Fix: collapse role gating down to workspace membership. Per-tab access is
-- already enforced by role + per-user nav overrides at the UI layer.

-- =========================
-- LEADS — every member of the workspace can read/write workspace leads.
-- =========================
DROP POLICY IF EXISTS "Workspace leads, role-scoped" ON leads;
CREATE POLICY "ws_select_leads" ON leads FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace insert leads" ON leads;
CREATE POLICY "ws_insert_leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace update leads" ON leads;
CREATE POLICY "ws_update_leads" ON leads FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace delete leads" ON leads;
CREATE POLICY "ws_delete_leads" ON leads FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- =========================
-- USERS — every workspace member can read the workspace roster.
-- (Sales Admin needs to see colleagues for assignment dropdowns; Super Admin
--  still uniquely retains UPDATE / DELETE via the policies below.)
-- =========================
DROP POLICY IF EXISTS "Workspace users readable by admin/manager" ON users;
CREATE POLICY "ws_select_users" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id = get_current_workspace_id()
  );

DROP POLICY IF EXISTS "Admin updates workspace users; users update self" ON users;
CREATE POLICY "ws_update_users" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1)
  );

DROP POLICY IF EXISTS "Admin deletes workspace users" ON users;
CREATE POLICY "ws_delete_users" ON users FOR DELETE
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1);

-- =========================
-- Generic sweep: every other ws_* policy on tenant tables that still has the
-- legacy "role_id IN (1, 2)" gate gets rewritten to pure workspace scoping.
-- Tables touched: segments, segment_rules, segment_members, campaigns,
-- campaign_templates, campaign_template_steps, ai_prompt_templates,
-- workflows, workflow_executions, sequences, sequence_steps,
-- newsletters, newsletter_recipients, email_templates,
-- blocklist, inbox_messages, lead_activities, user_permissions, notifications.
-- =========================
DO $$
DECLARE
  t TEXT;
  cmd TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'segments','segment_rules','segment_members',
    'campaigns','campaign_templates','campaign_template_steps','ai_prompt_templates',
    'workflows','workflow_executions','sequences','sequence_steps',
    'newsletters','newsletter_recipients','email_templates',
    'blocklist','inbox_messages','lead_activities','user_permissions'
  ])
  LOOP
    -- Drop any policy that still references "role_id IN (1, 2)" or owner_id-gates
    DECLARE p RECORD;
    BEGIN
      FOR p IN
        SELECT policyname FROM pg_policies WHERE tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', p.policyname, t);
      END LOOP;
    END;

    -- Recreate clean workspace-only policies
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());',
                   'ws_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_delete_' || t, t);
  END LOOP;
END $$;

-- Notifications keep per-user scoping (each user only sees their own) but must
-- not leak across workspaces.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications;', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "ws_select_notifications" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
CREATE POLICY "ws_insert_notifications" ON notifications FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY "ws_update_notifications" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
CREATE POLICY "ws_delete_notifications" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
