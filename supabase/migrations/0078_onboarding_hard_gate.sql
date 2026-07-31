-- ============================================================================
-- Onboarding hard-gate: per-user profile fields, grandfathering flag for
-- workspaces that already finished onboarding under the old (looser) rules,
-- an avatar upload bucket, and a broadened signup trigger that captures
-- whatever name/avatar OAuth actually hands Supabase.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Existing workspaces that already completed onboarding under the old
-- definition (business info only) are permanently exempt from the new
-- profile+mailbox requirements — see plan doc for full reasoning.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_grandfathered BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE workspaces SET onboarding_grandfathered = TRUE WHERE onboarding_completed = TRUE;

-- Avatar uploads — same public-bucket, admin-client-only-writes pattern as
-- the existing newsletter-images / lead-notes buckets (no storage.objects RLS
-- policy needed since uploads only ever happen via the service-role key).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Broaden the signup trigger (originally from 0013_fix_signup_trigger.sql) to
-- also capture an avatar/picture claim and a wider name fallback — Google and
-- LinkedIn OIDC don't reliably land the same fields under raw_user_meta_data.
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
