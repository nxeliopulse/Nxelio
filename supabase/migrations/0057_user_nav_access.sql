-- Per-user nav permission overrides on top of role defaults.
-- Shape: { "/leads": true, "/newsletters": false }
-- A present key overrides the role default for that nav item.
-- A missing key falls back to whatever the user's role normally allows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS nav_access JSONB DEFAULT '{}'::jsonb;
