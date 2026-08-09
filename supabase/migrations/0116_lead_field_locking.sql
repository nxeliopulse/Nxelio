-- ============================================================================
-- 0116_lead_field_locking.sql
--
-- Email, Phone, LinkedIn, and Industry each lock individually the first time
-- someone edits and saves that field — after that, only a Super Admin can
-- change it. A field with its original (e.g. import-time) value is NOT
-- locked yet; it only locks once it's actually been edited once, so nothing
-- already on file becomes suddenly uneditable the moment this ships.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS locked_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
