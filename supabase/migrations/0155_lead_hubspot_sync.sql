-- ============================================================================
-- 0155 — Track HubSpot contact sync state per lead.
-- Additive/nullable — a null hubspot_contact_id just means "never synced".
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_synced_at TIMESTAMPTZ;
