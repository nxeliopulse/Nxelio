-- Adds "Domain" and "Account Status" to accounts, matching the Create/Edit
-- Account wizard's Account Information step. Both are nullable — existing
-- rows are unaffected.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_status TEXT;
