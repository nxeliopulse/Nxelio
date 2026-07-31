-- Fix: getUsers() (the /users "People" roster) joins workspace_members -> users
-- to show each member's profile (name, email, avatar). The old "ws_select_users"
-- SELECT policy only allowed reading a user row when workspace_id = the CALLER's
-- currently active workspace — but that column is the TARGET's own active
-- pointer, which may point at a different workspace than the one they're
-- actually being looked up in (a member can belong to several workspaces and
-- only one is "active" for them at a time). So a legitimate member whose own
-- active pointer happens to be elsewhere silently vanished from the roster —
-- the exact same class of bug fixed for the `workspaces` table in migration
-- 0081, just on `users`. Widen SELECT to also allow reading any user who has
-- an ACTIVE workspace_members row in the caller's current workspace.
DROP POLICY IF EXISTS "ws_select_users" ON users;
CREATE POLICY "ws_select_users" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id = get_current_workspace_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = users.user_id
        AND wm.workspace_id = get_current_workspace_id()
        AND wm.status = 'ACTIVE'
    )
  );
