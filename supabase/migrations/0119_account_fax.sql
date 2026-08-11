-- ============================================================================
-- 0119_account_fax.sql
--
-- The Account edit form has always had a Fax field, but accounts had no fax
-- column at all — every edit was silently discarded. Adding the real column.
-- ============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS fax TEXT;

