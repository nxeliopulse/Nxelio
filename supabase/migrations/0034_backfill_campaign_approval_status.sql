-- ============================================================================
-- Backfill approval_status for campaigns that were already sending before the
-- content-approval lifecycle (migration 0033) existed. Those rows got the
-- column's default 'Draft (AI-generated)' even though they were genuinely
-- already Active/Paused with real sends — misleadingly showing "Draft" in the
-- list while their detail page correctly showed "Active".
-- ============================================================================

UPDATE campaigns
SET approval_status = 'Live/Distributing'
WHERE approval_status = 'Draft (AI-generated)'
  AND (status IN ('Active', 'Paused') OR sent_count > 0);
