-- Adds YouTube and Pinterest to Social Profile, alongside the existing
-- facebook/whatsapp/instagram/linkedin/twitter/skype_id columns.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS youtube TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pinterest TEXT;
