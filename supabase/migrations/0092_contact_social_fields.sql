-- Adds the remaining Social Profile fields from the Contact form redesign:
-- Facebook, WhatsApp, and Instagram. Twitter, LinkedIn, and Skype ID already
-- existed (0076_accounts_contacts.sql).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram TEXT;
