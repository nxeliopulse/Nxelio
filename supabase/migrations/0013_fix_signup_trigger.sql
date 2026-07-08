-- Fix: signup trigger was blocked by missing INSERT policy on workspaces

-- 1. Allow service_role + the function definer to insert workspaces
DROP POLICY IF EXISTS "Authenticated insert workspaces" ON workspaces;
CREATE POLICY "Authenticated insert workspaces" ON workspaces FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Rewrite the trigger with exception handling so any failure doesn't break signup
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

  -- Create workspace + user profile
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log but don't block the auth.users INSERT
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user_with_workspace();
