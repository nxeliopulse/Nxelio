-- ============================================================================
-- Per-user data scoping for leads
-- ============================================================================

-- owner_id already exists in 0001 referencing users(user_id); make sure it
-- exists as an auth.users reference (idempotent — column add only if missing).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Default owner_id to the currently authenticated user on insert
CREATE OR REPLACE FUNCTION set_lead_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_lead_owner ON leads;
CREATE TRIGGER trg_set_lead_owner
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION set_lead_owner();

-- Promote primary admin
UPDATE users SET role_id = 1 WHERE email = 'harirajanncse@gmail.com';

-- Backfill any leads with no owner to the admin
UPDATE leads
  SET owner_id = (SELECT user_id FROM users WHERE role_id = 1 LIMIT 1)
  WHERE owner_id IS NULL;

-- Replace the read-all policy with a scoped one
DROP POLICY IF EXISTS "Authenticated read leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read all leads" ON leads;
DROP POLICY IF EXISTS "Read scoped leads" ON leads;
CREATE POLICY "Read scoped leads" ON leads
  FOR SELECT TO authenticated
  USING (
    get_current_user_role_id() IN (1, 2)
    OR owner_id = auth.uid()
  );
