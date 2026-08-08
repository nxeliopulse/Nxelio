-- Phase 6: deduplicated proactive AI signals.
CREATE TABLE IF NOT EXISTS ai_proactive_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fingerprint       TEXT NOT NULL,
  kind              TEXT NOT NULL,
  severity          TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  recommendation    TEXT NOT NULL,
  link              TEXT NOT NULL,
  entity_id         UUID,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS ai_proactive_alerts_active_idx
  ON ai_proactive_alerts(workspace_id, status, last_seen_at DESC);

DROP TRIGGER IF EXISTS ai_proactive_alerts_updated_at ON ai_proactive_alerts;
CREATE TRIGGER ai_proactive_alerts_updated_at
  BEFORE UPDATE ON ai_proactive_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_proactive_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_proactive_select ON ai_proactive_alerts;
CREATE POLICY ai_proactive_select ON ai_proactive_alerts FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ai_proactive_acknowledge ON ai_proactive_alerts;
CREATE POLICY ai_proactive_acknowledge ON ai_proactive_alerts FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id())
  WITH CHECK (workspace_id = get_current_workspace_id());

-- Inserts and resolution are performed by the protected server cron using the
-- service-role client. No automatic write action is connected to a signal.

-- Optional Supabase pg_cron setup (replace URL and secret storage for the deployment):
-- SELECT cron.schedule('nxelio-proactive-ai-daily', '0 8 * * *',
--   $$SELECT net.http_get(url := 'https://YOUR_APP_URL/api/ai/proactive',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_AI_PROACTIVE_CRON_SECRET'));$$);
