-- Additional Details step in the Edit Account wizard collects these three
-- fields, but they were never given DB columns — silently dropped on save.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_site TEXT,
  ADD COLUMN IF NOT EXISTS parent_account TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT;
