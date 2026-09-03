-- ============================================================================
-- Repair role names on production.
--
-- 0149 seeded `roles` with the ORIGINAL names from 0001_initial_schema.sql
-- ('Admin' / 'Manager' / 'Sales Rep'). 0015_role_restructure_and_capture_slug
-- had already renamed them, and production never ran 0015 — so the seeded rows
-- carried the pre-0015 names.
--
-- src/app/(app)/layout.tsx reads roles.role_name and passes it straight to
-- filterNavByRoleAndOverrides() in src/lib/nav-config.ts, which matches against
-- "Super Admin" / "Sales Admin" / "Marketing Admin". Any other value matches
-- nothing, so every sidebar item is filtered out and the menu renders empty.
--
-- 0149 has been corrected too; this migration repairs databases that already
-- ran the earlier version. Safe to re-run.
-- ============================================================================

UPDATE roles SET role_name        = 'Super Admin',
                 role_description = 'Full access to the workspace including users, billing, and integrations.'
WHERE role_id = 1;

UPDATE roles SET role_name        = 'Marketing Admin',
                 role_description = 'Access to segments, newsletters, templates, workflows, and analytics — no sales pipeline.'
WHERE role_id = 2;

UPDATE roles SET role_name        = 'Sales Admin',
                 role_description = 'Access to leads, campaigns, inbox, workflows, and analytics — no marketing tools.'
WHERE role_id = 3;

-- 0015 also added workspaces.capture_slug and backfilled it. Production may
-- have the column but no value on workspaces created by 0147's backfill, and
-- the column is UNIQUE + used for public capture URLs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workspaces' AND column_name='capture_slug'
  ) AND EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'generate_capture_slug'
  ) THEN
    UPDATE workspaces SET capture_slug = generate_capture_slug() WHERE capture_slug IS NULL;
  END IF;
END $$;
