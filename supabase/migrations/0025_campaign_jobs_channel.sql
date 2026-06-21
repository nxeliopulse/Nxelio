-- ============================================================================
-- Multichannel campaign steps — let a campaign sequence mix Email + LinkedIn.
-- Adds channel/action to the campaign job queue so the scheduler knows whether
-- a queued step is an email, a LinkedIn connection request, or a LinkedIn message.
-- ============================================================================

ALTER TABLE campaign_jobs ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email';
-- 'email' | 'connection_request' | 'linkedin_message'
ALTER TABLE campaign_jobs ADD COLUMN IF NOT EXISTS action VARCHAR(40) NOT NULL DEFAULT 'email';
