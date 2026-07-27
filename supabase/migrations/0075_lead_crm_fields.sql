-- ============================================================================
-- 0075 — Expand leads with standard CRM fields (Salesforce/Zoho-style)
-- All additive/nullable — nothing here changes existing behavior until the
-- app starts writing to these columns. first_name/last_name are backfilled
-- once from the existing full_name for rows that predate this migration.
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS annual_revenue TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_status TEXT,
  ADD COLUMN IF NOT EXISTS twitter_handle TEXT,
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- One-time backfill: split existing full_name into first/last for rows that
-- don't have them yet (new rows going forward get these set explicitly by the app).
UPDATE leads
SET
  first_name = COALESCE(first_name, NULLIF(split_part(trim(full_name), ' ', 1), '')),
  last_name = COALESCE(last_name, NULLIF(trim(regexp_replace(trim(full_name), '^\S+\s*', '')), ''))
WHERE full_name IS NOT NULL AND trim(full_name) <> '' AND (first_name IS NULL OR last_name IS NULL);
