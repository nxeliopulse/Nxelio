-- Lets an inbox_messages row link to a Contact instead of only a Lead —
-- independent of lead_id (a message can have either, both, or neither),
-- same pattern as 0097_meeting_contact_link.sql for meetings.
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_contact ON inbox_messages(contact_id, created_at DESC);
