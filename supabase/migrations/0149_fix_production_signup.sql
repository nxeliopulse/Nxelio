-- ============================================================================
-- Fix production signup: seed roles, install the missing auth.users trigger,
-- stop the trigger from hiding its own failures, and repair accounts that
-- were already created without a profile.
--
-- Production (project sgvofunorxnicxulpjdg) was built by hand rather than from
-- these migration files, so it ended up with the trigger FUNCTION present but
-- no TRIGGER calling it, and an empty `roles` table. Signup therefore created
-- an auth.users row and nothing else, and the first thing to notice was
-- /api/billing/checkout returning "Profile not found".
--
-- Safe to re-run, and safe on environments that are already correct.
-- ============================================================================

-- 1. Seed the role rows the app hardcodes ------------------------------------
-- role_id 1 = Admin is assumed by the signup trigger and by the RLS policy in
-- 0002_rls_and_triggers.sql. Explicit ids, because SERIAL would not reproduce
-- them. ON CONFLICT DO NOTHING (untargeted) covers both the role_id and the
-- role_name unique constraints, so this is a no-op where the rows exist.
-- Names are the post-0015_role_restructure values, NOT the original 0001 ones
-- ('Admin'/'Manager'/'Sales Rep'). src/lib/nav-config.ts filters the sidebar on
-- these exact strings, so the old names render an empty menu.
INSERT INTO public.roles (role_id, role_name, role_description) VALUES
  (1, 'Super Admin',     'Full access to the workspace including users, billing, and integrations.'),
  (2, 'Marketing Admin', 'Access to segments, newsletters, templates, workflows, and analytics — no sales pipeline.'),
  (3, 'Sales Admin',     'Access to leads, campaigns, inbox, workflows, and analytics — no marketing tools.')
ON CONFLICT DO NOTHING;

-- Keep the sequence ahead of the explicit ids we just inserted, otherwise the
-- next SERIAL insert collides with role_id 1.
SELECT setval('public.roles_role_id_seq',
              GREATEST((SELECT COALESCE(max(role_id), 1) FROM public.roles), 1),
              true);

-- 2. Signup trigger function -------------------------------------------------
-- Same body as 0085_onboarding_hard_gate.sql, with one deliberate change: the
-- EXCEPTION ... RAISE WARNING block is gone. Swallowing errors is what turned a
-- database problem into an account that looks fine until checkout. Now a failure
-- aborts the signup, so it is visible at the moment it happens.
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
  picture_url TEXT;
BEGIN
  -- Skip if profile already exists (admin-invited user)
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  picture_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id, avatar_url)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws, picture_url);

  INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
  VALUES (NEW.id, new_ws, 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 3. The trigger itself — this is what production was missing -----------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user_with_workspace();

-- 4. Repair accounts already created without a profile ------------------------
-- These signed up while the trigger was absent. Give each the workspace,
-- profile and membership rows the trigger would have made, so the existing
-- login keeps working instead of needing a fresh signup.
DO $$
DECLARE
  a RECORD;
  new_ws UUID;
  display_name TEXT;
BEGIN
  FOR a IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.users u ON u.user_id = au.id
    WHERE u.user_id IS NULL
  LOOP
    display_name := COALESCE(
      a.raw_user_meta_data->>'full_name',
      a.raw_user_meta_data->>'name',
      split_part(a.email, '@', 1)
    );

    INSERT INTO public.workspaces (name, owner_id)
    VALUES (display_name || '''s workspace', a.id)
    RETURNING id INTO new_ws;

    INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id, avatar_url)
    VALUES (a.id, display_name, a.email, 1, 'ACTIVE', new_ws,
            COALESCE(a.raw_user_meta_data->>'avatar_url',
                     a.raw_user_meta_data->>'picture'));

    INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
    VALUES (a.id, new_ws, 1)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;

    RAISE NOTICE 'Backfilled profile for %', a.email;
  END LOOP;
END $$;
