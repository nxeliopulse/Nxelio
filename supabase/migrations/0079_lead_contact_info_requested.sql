-- ============================================================================
-- Dedup guard for the LinkedIn "auto-ask for contact info" feature: when a
-- lead replies to a LinkedIn message with positive intent (AI-classified),
-- we send one automatic follow-up asking for their email/phone. This column
-- is set the first time we ask, so a lead who keeps replying positively never
-- gets asked more than once.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_info_requested_at TIMESTAMPTZ;
