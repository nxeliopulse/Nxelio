-- A social prospect often has only a LinkedIn / profile URL, no email or website.
-- Relax lead_contact_check so a linkedin URL also satisfies the "has contact" rule.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS lead_contact_check;
ALTER TABLE leads ADD CONSTRAINT lead_contact_check
  CHECK (email IS NOT NULL OR website_url IS NOT NULL OR linkedin IS NOT NULL);
