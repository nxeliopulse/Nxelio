-- Multi-workspace support: a login can belong to several workspaces and
-- switch between them. get_current_workspace_id() keeps reading users.workspace_id
-- (the "currently active" workspace pointer) unchanged, so every existing RLS
-- policy across ~30 tenant tables keeps working as-is. workspace_members is the
-- new many-to-many membership source of truth (which workspaces a login can
-- switch into, and their role in each) — "switching" = updating that single
-- pointer after validating membership here.
CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role_id      INT NOT NULL REFERENCES roles(role_id),
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | REMOVED
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
DROP TRIGGER IF EXISTS trg_workspace_members_updated ON workspace_members;
CREATE TRIGGER trg_workspace_members_updated BEFORE UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_workspace_members ON workspace_members;
-- Self-select (for the workspace switcher UI) OR same-workspace-as-caller
-- select (for the /users roster, which needs to see every member of the
-- CURRENT workspace regardless of which workspace they're currently "active" in).
CREATE POLICY ws_select_workspace_members ON workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR workspace_id = get_current_workspace_id());
-- No INSERT/UPDATE/DELETE policies for workspace_members — every write goes
-- through server actions using the service-role admin client (mirrors the
-- existing requireSuperAdmin()/inviteUser() pattern), never a raw RLS-bound write.

-- Backfill: every existing single-workspace user becomes a membership row.
INSERT INTO workspace_members (user_id, workspace_id, role_id)
SELECT user_id, workspace_id, COALESCE(role_id, 1) FROM users WHERE workspace_id IS NOT NULL
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Every new signup also gets a membership row for their first workspace.
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
BEGIN
  -- Skip if profile already exists (admin-invited user)
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
  VALUES (NEW.id, new_ws, 1);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Close a pre-existing self-escalation gap: the ws_update_users UPDATE policy
-- has no separate WITH CHECK, so a plain authenticated client update could
-- previously set its own workspace_id/role_id to any value and pass RLS.
-- Supabase grants table-wide UPDATE to `authenticated` by default, so a plain
-- column-level REVOKE alone is a no-op here — the table-wide grant still lets
-- every column through. Revoke table-wide, then re-grant UPDATE on every
-- column EXCEPT workspace_id/role_id, so those two may only change via server
-- actions using the service-role client (which bypasses grants entirely).
REVOKE UPDATE ON users FROM authenticated;
GRANT UPDATE (full_name, manager_id, status, avatar_url, last_login, nav_access, phone, job_title, updated_at) ON users TO authenticated;
