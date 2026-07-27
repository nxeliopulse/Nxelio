-- ============================================================================
-- 0074 — Persist the resolved Unipile LinkedIn provider_id per lead
-- LinkedIn reply webhooks identify the sender by an opaque provider_id, not
-- the human-readable public URL slug stored in leads.linkedin — so inbound
-- replies could never be matched back to a lead. We now save the provider_id
-- the first time we successfully resolve/message a lead, so future replies
-- match on this exact id instead of guessing from a URL.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_provider_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_linkedin_provider_id ON leads(linkedin_provider_id) WHERE linkedin_provider_id IS NOT NULL;
