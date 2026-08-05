-- Lets an inbox_messages row link to an Account instead of only a Lead —
-- independent of contact_id (a message can have either, both, or neither),
-- same pattern as 0102_inbox_contact_link.sql for contacts.
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_account ON inbox_messages(account_id, created_at DESC);
