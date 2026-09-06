-- Temporarily pull "Company-wise Leads" (the second tab inside Buy Leads) out
-- of the product — same locked-by-default preview pattern as
-- 0152_verified_emails_feature_gate.sql, so the platform admin can turn it
-- back on later from Feature Access without a code change.
ALTER TABLE feature_kill_switches DROP CONSTRAINT feature_kill_switches_feature_key_check;
ALTER TABLE feature_kill_switches ADD CONSTRAINT feature_kill_switches_feature_key_check
  CHECK (feature_key IN ('launch_campaign', 'send_email', 'send_newsletter', 'verified_emails_source', 'company_wise_leads'));

INSERT INTO feature_kill_switches (feature_key, enabled) VALUES
  ('company_wise_leads', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
