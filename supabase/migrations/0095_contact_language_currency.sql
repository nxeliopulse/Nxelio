-- Adds Language and Currency to the Contact detail page's "Other Information"
-- card. Simple free-text picklists (matching the pattern of other Contact
-- fields like industry) — no separate lookup table needed.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS currency TEXT;
