-- Fix: the workspace switcher's getMyWorkspaces() joins workspace_members -> workspaces
-- to show each workspace's name. The old "Read own workspace" SELECT policy only allowed
-- reading the CURRENTLY ACTIVE workspace (id = get_current_workspace_id()), so every OTHER
-- workspace a login belongs to came back null from that join and got silently dropped from
-- the switcher list — a member could see and switch INTO a workspace once, but never back
-- out of it via the switcher. Widen SELECT to also allow any workspace you're a member of.
DROP POLICY IF EXISTS "Read own workspace" ON workspaces;
CREATE POLICY "Read own workspace" ON workspaces FOR SELECT TO authenticated
  USING (
    id = get_current_workspace_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id AND wm.user_id = auth.uid() AND wm.status = 'ACTIVE'
    )
  );
