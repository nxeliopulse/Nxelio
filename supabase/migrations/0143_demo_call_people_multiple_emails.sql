-- ============================================================================
-- 0137 — A demo call person can have more than one email (e.g. a rep who
-- wants call notifications at both a work and personal inbox, or a shared
-- team inbox alongside a personal one). Replaces the single `email` column
-- with `emails TEXT[]`, backfilling existing rows first.
-- ============================================================================

ALTER TABLE demo_call_people ADD COLUMN IF NOT EXISTS emails TEXT[] NOT NULL DEFAULT '{}';

UPDATE demo_call_people
SET emails = ARRAY[email]
WHERE cardinality(emails) = 0 AND email IS NOT NULL;

ALTER TABLE demo_call_people DROP COLUMN IF EXISTS email;
