-- ============================================================================
-- 0118_contact_owner_default.sql
--
-- Contacts almost always showed "Unassigned" as Owner because contact_owner
-- was never defaulted anywhere (manual creation left it blank unless
-- explicitly picked, and CSV import never set it at all). Fixes it the same
-- way leads.owner_id is already auto-filled — a BEFORE INSERT trigger that
-- defaults to the inserting user, only when the caller didn't already set
-- one (never overrides an explicit owner pick, e.g. from an admin invite flow).
-- ============================================================================

CREATE OR REPLACE FUNCTION set_contact_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_owner IS NULL THEN
    NEW.contact_owner := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_contact_owner ON contacts;
CREATE TRIGGER trg_set_contact_owner
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_contact_owner();
