-- Tracks who created/last-modified an account, for the Edit Account wizard's
-- sidebar ("Account Created" / "Last Modified" cards). Denormalized display
-- names (matching account_owner's style), not a join to the audit log —
-- that table is Super Admin-only, and this needs to be visible to anyone who
-- can already see the account.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_by TEXT;
