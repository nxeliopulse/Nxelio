-- ============================================================================
-- Email verification codes — signup now leaves the Supabase auth account
-- unconfirmed until the user enters the 6-digit code emailed to them. Only
-- reachable via the service-role admin client (matches the platform-settings
-- RLS convention: enabled, zero policies).
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active code per user — resending replaces the previous row.
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_codes_user_idx ON email_verification_codes(user_id);

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
