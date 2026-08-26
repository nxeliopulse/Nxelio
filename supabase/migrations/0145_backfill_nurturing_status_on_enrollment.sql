-- One-time backfill: leads already actively enrolled in a campaign (before
-- the enrollment flow started auto-setting status to "Nurturing") get moved
-- to "Nurturing" now, so their status reflects reality. Skips leads already
-- "Nurturing" or "Converted" — enrollment shouldn't regress a closed lead.
UPDATE leads l
SET status = 'Nurturing'
FROM campaign_enrollments ce
WHERE ce.lead_id = l.id
  AND ce.status = 'active'
  AND l.status NOT IN ('Nurturing', 'Converted');
