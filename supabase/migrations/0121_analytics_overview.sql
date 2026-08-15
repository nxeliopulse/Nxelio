-- ============================================================================
-- Analytics Overview — campaign/segment attribution columns on opportunities.
--
-- opportunities.lead_id is ON DELETE SET NULL, so campaign/segment
-- attribution would silently break if the originating lead is later
-- deleted. Denormalizing these onto the opportunity at conversion time (see
-- src/lib/queries/opportunities.ts's createOpportunityFromLead) keeps
-- Campaign → Pipeline → Revenue analytics accurate regardless of what
-- happens to the lead afterward. `source` already exists (0103) and is
-- reused as-is. Both new columns nullable — existing rows are simply
-- unattributed until re-converted, no backfill needed for Phase 1.
-- ============================================================================

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_campaign ON opportunities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_segment ON opportunities(segment_id);
