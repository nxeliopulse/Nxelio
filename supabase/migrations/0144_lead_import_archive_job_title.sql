-- Adds job_title to the permanent lead import archive so the platform
-- Admin > Leads Archive tab can filter by Role, alongside the existing
-- Industry and email fields. Backfilled best-effort from the still-existing
-- source lead (via original_lead_id) — rows whose source lead was since
-- deleted have no way to recover this and stay NULL, same honesty rule as
-- everything else in the archive (never fabricate a field).
ALTER TABLE lead_import_archive
  ADD COLUMN IF NOT EXISTS job_title TEXT;

UPDATE lead_import_archive a
SET job_title = l.job_title
FROM leads l
WHERE a.original_lead_id = l.id
  AND a.job_title IS NULL
  AND l.job_title IS NOT NULL;
