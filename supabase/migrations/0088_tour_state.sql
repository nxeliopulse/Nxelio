-- ============================================================================
-- Product tour state — per-user (not per-workspace), so every teammate gets
-- their own first-run tour regardless of who set up the workspace. Stored on
-- `users` (PK = auth user id) rather than a new table since it's a single
-- small JSON blob per user with no need for relational queries over it.
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- users has a column-level GRANT restricting which columns `authenticated` may
-- self-update (see 0081_workspace_members.sql: REVOKE UPDATE ON users FROM
-- authenticated; GRANT UPDATE (full_name, ...) ON users TO authenticated;).
-- Without this line, a plain client update to tour_state fails at the
-- Postgres grant layer even though RLS would allow it.
GRANT UPDATE (tour_state) ON users TO authenticated;
