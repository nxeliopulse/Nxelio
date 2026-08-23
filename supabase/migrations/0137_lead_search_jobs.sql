-- ============================================================================
-- Lead search jobs — background "Verified Leads" search.
--
-- Lets a user request N verified-email prospects without waiting on the
-- request: a row is inserted here `pending`, and a per-minute cron (see the
-- commented pg_cron block below) drains it in small chunks — one search
-- round + a handful of email lookups per tick — persisting progress after
-- every batch so a Vercel function timeout never loses work. Keeps going
-- (escalating the search round) until it hits requested_count or genuinely
-- runs out of new prospects, then emails the requester and marks the row
-- `done`. Mirrors the outreach_jobs/campaign_jobs queue shape.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  notify_email TEXT NOT NULL,
  criteria JSONB NOT NULL,
  requested_count INT NOT NULL,
  -- 'pending' | 'running' | 'done' | 'failed'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  found_count INT NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,        -- GeneratedProspect[] confirmed-verified so far
  pending_pool JSONB NOT NULL DEFAULT '[]'::jsonb,    -- raw prospects awaiting email lookup
  seen_linkedin JSONB NOT NULL DEFAULT '[]'::jsonb,   -- dedupe across search rounds
  round INT NOT NULL DEFAULT 0,
  search_exhausted BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_search_jobs_due ON lead_search_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_lead_search_jobs_workspace ON lead_search_jobs(workspace_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['lead_search_jobs']) LOOP
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

-- Drained every minute by /api/leads/search-jobs/cron (Authorization: Bearer
-- LEAD_SEARCH_CRON_SECRET). Uncomment and fill in the real app URL + secret
-- once deployed:
-- SELECT cron.schedule('process-lead-search-jobs', '* * * * *', $$
--   SELECT net.http_post(
--     url := 'https://YOUR_APP_URL/api/leads/search-jobs/cron',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_LEAD_SEARCH_CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
