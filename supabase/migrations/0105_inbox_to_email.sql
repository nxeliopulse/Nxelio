-- Records the actual "To" address for a contact email (the compose form lets
-- it be edited away from the contact's own email) — nullable, older/implicit
-- rows fall back to displaying the contact's own email.
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS to_email TEXT;
