-- ============================================================================
-- Per-campaign approval toggle — lets the creator choose, at build time,
-- whether this campaign must go through the review/approval lifecycle
-- (0033_campaign_approval_lifecycle.sql) before it can launch, or can be
-- launched directly. Defaults to TRUE so existing behavior (every campaign
-- requires approval) is unchanged for campaigns created before this column
-- existed.
-- ============================================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT true;
