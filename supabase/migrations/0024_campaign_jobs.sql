-- ============================================================================
-- Campaign job queue — schedules multi-step campaign follow-ups.
--
-- When a campaign is launched, Step 1 sends immediately and Steps 2..N are
-- inserted here with a run_at = launch + their delay. The same per-minute cron
-- that drains outreach_jobs also drains these (see /api/outreach/cron), so the
-- timed follow-ups actually send — with the campaign's Brevo tag + inbox logging
-- intact (unlike the generic outreach processor).
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 1,
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

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_due ON campaign_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_lead ON campaign_jobs(lead_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['campaign_jobs']) LOOP
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
