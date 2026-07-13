-- ============================================================================
-- Audit log — durable "who did what" trail across the app (campaigns, leads,
-- buy-leads, segments, templates, newsletters, connectors, users/roles, etc.),
-- viewable by Super Admin only. Insert-only: no UPDATE/DELETE policy exists for
-- any role, so entries can't be altered or wiped once written (even by admins,
-- via the app) — unlike `notifications`, which users can delete themselves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name     TEXT,
  action         TEXT NOT NULL,        -- e.g. "campaign.created", "leads.bought", "segment.deleted"
  entity_type    TEXT,                 -- e.g. "campaign", "lead", "segment"
  entity_id      UUID,
  entity_label   TEXT,                 -- human-readable name, e.g. the campaign's name
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON audit_log;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may log an entry (scoped to their own workspace) —
-- defense-in-depth only; the app writes via the admin client in practice.
DROP POLICY IF EXISTS ws_insert_audit_log ON audit_log;
CREATE POLICY ws_insert_audit_log ON audit_log FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

-- Only a Super Admin can read the log, scoped to their own workspace.
DROP POLICY IF EXISTS admin_select_audit_log ON audit_log;
CREATE POLICY admin_select_audit_log ON audit_log FOR SELECT TO authenticated
  USING (get_current_user_role_id() = 1 AND workspace_id = get_current_workspace_id());

-- Deliberately no UPDATE or DELETE policy — the log is immutable at the DB level.
