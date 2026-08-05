-- ============================================================================
-- Lets a meeting be scheduled against a Contact, not only a Lead. contact_id
-- is independent of lead_id — a meeting can reference either, both, or
-- neither. Mirrors the lead_id column added in 0031_meetings.sql.
-- ============================================================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_contact_idx ON meetings(contact_id);
