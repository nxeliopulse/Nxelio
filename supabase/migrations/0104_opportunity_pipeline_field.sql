-- Adds Pipeline to Deals — a simple department/team picklist (Sales/Marketing/
-- Calls), not a separate multi-pipeline stage system. That bigger version was
-- explicitly skipped earlier; this is just a plain categorization field.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pipeline TEXT;
