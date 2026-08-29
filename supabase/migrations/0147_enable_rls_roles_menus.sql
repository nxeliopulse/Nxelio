-- ============================================================================
-- 0147 — Enable RLS on `roles` and `menus`
-- Fixes Supabase Security Advisor errors: "RLS Disabled in Public" on
-- public.roles and public.menus. Both tables were never included in
-- 0002_rls_and_triggers.sql's original RLS pass, leaving them fully open to
-- the anon/authenticated API keys (any client could read AND write them).
--
-- Both are global, non-tenant reference/lookup tables (no workspace_id or
-- user_id column) — a fixed set of role names and nav-menu entries shared
-- across every workspace, seeded via migration and never written to by the
-- app (grep of src/ confirms every call site is a SELECT via the
-- session-bound client; the one write-adjacent call in inviteUser() is a
-- read-only existence check, and already uses createAdminClient(), which
-- bypasses RLS regardless). Mirrors the identical pattern already used for
-- subscription_plans in 0027_subscription_plans.sql: read-only for signed-in
-- users, no anon access, no user-facing write policy.
-- ============================================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_select_authenticated ON roles;
CREATE POLICY roles_select_authenticated ON roles
  FOR SELECT TO authenticated USING (TRUE);

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menus_select_authenticated ON menus;
CREATE POLICY menus_select_authenticated ON menus
  FOR SELECT TO authenticated USING (TRUE);
