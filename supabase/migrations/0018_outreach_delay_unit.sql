-- ============================================================================
-- Outreach: per-step delay UNIT (minutes | hours | days)
-- delay_days now holds the delay VALUE; delay_unit says what unit it is.
-- Lets you set short delays ("wait 2 minutes") for real-time testing.
-- ============================================================================
ALTER TABLE outreach_steps ADD COLUMN IF NOT EXISTS delay_unit VARCHAR(10) NOT NULL DEFAULT 'days';
