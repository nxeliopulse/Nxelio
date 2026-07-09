-- ============================================================================
-- Outreach: real engine
--   * outreach_accounts  — connected Gmail/Outlook + LinkedIn accounts (Unipile)
--   * outreach_jobs       — the scheduled-action queue the cron processor drains
--   * enrollment.next_run — driven by the queue, replies cancel pending jobs
-- The processor runs under the service role (no auth.uid()), so every insert it
-- makes MUST carry workspace_id explicitly — the auto-fill trigger can't help it.
-- ============================================================================

-- 1. Connected sending accounts (one row per mailbox / LinkedIn profile)
CREATE TABLE IF NOT EXISTS outreach_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL DEFAULT 'unipile',
  -- 'email' | 'linkedin'
  channel VARCHAR(20) NOT NULL,
  -- Unipile's account id used when sending
  account_id VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  identifier VARCHAR(255),            -- email address or LinkedIn handle
  -- 'connected' | 'error' | 'disconnected'
  status VARCHAR(20) NOT NULL DEFAULT 'connected',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, account_id)
);

-- 2. The scheduled-action queue. One row = "send this step to this lead at run_at".
CREATE TABLE IF NOT EXISTS outreach_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_id UUID REFERENCES outreach_steps(id) ON DELETE SET NULL,
  step_order INT NOT NULL DEFAULT 1,
  channel VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  body TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'pending' | 'sent' | 'failed' | 'skipped' | 'canceled'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- The processor's hot query: pending jobs that are due.
CREATE INDEX IF NOT EXISTS idx_outreach_jobs_due ON outreach_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_outreach_jobs_enrollment ON outreach_jobs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_outreach_accounts_ws ON outreach_accounts(workspace_id, channel);

-- 3. Workspace auto-fill trigger + RLS (same pattern as 0012 / 0016)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['outreach_accounts','outreach_jobs']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_update_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_update_%s ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_delete_%s ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- 4. SCHEDULER (run this block once, after filling in the two placeholders).
--    Requires the pg_cron + pg_net extensions (enable in Supabase dashboard:
--    Database → Extensions → enable "pg_cron" and "pg_net").
--    It pings our app's cron route every minute; the route drains due jobs.
--    Left commented because it needs YOUR app URL + a shared secret.
-- ============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'process-outreach',
--   '* * * * *',                          -- every minute
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_APP_URL/api/outreach/cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer YOUR_OUTREACH_CRON_SECRET'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
-- To stop it later:  SELECT cron.unschedule('process-outreach');
