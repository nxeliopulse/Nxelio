-- The "Verified Emails" lead source is a preview feature — unlike the
-- existing kill switches (which pause something already live), this one
-- ships LOCKED until the platform admin explicitly turns it on for everyone.
ALTER TABLE feature_kill_switches DROP CONSTRAINT feature_kill_switches_feature_key_check;
ALTER TABLE feature_kill_switches ADD CONSTRAINT feature_kill_switches_feature_key_check
  CHECK (feature_key IN ('launch_campaign', 'send_email', 'send_newsletter', 'verified_emails_source'));

INSERT INTO feature_kill_switches (feature_key, enabled) VALUES
  ('verified_emails_source', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
