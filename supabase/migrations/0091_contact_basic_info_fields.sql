-- Adds the remaining fields from the "Add New Contact" Basic Info redesign:
-- a profile photo, free-text tags (comma-separated, matching the "Enter value
-- separated by comma" UI hint), a 1-5 star rating, and an Industry select
-- (independent of accounts.industry — a contact can have its own industry
-- even before/without being linked to a Company record).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
