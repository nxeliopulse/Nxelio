-- Adds record-level visibility to Contacts (Public / Private / Select People),
-- matching the "Access" section of the Contact form redesign. visible_to holds
-- a comma-separated list of user_id values, same convention as contacts.tags,
-- and only applies when visibility = 'select_people'.
-- Note: this records the chosen setting but does not (yet) enforce it via RLS —
-- that would need a separate policy change once the sharing rules are decided.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private', 'select_people'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visible_to TEXT;
