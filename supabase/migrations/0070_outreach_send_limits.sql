-- ============================================================================
-- Outreach daily send limits — per-workspace, per-channel (email/linkedin)
-- daily min/max caps, configurable from Settings > Email / Settings > LinkedIn.
-- A workspace with no row here sends unthrottled (today's existing behavior) —
-- the cap only kicks in once an admin explicitly sets one, so this never
-- surprises an existing workspace on deploy.
--
-- outreach_send_counts tracks each calendar day's actual usage: the first send
-- attempt of the day locks in a random quota inside [daily_min, daily_max] (a
-- human-like day-to-day cadence rather than a flat number — matches how
-- LinkedIn/email warm-up guidance is usually expressed as a range) and reuses
-- it for the rest of that day. consume_send_quota() is the single atomic entry
-- point both the manual "Send now" path and the per-minute cron use to check +
-- reserve quota before sending, so the two paths can never double-spend it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_send_limits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'linkedin')),
  daily_min    INTEGER NOT NULL CHECK (daily_min >= 0),
  daily_max    INTEGER NOT NULL CHECK (daily_max >= daily_min),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel)
);

CREATE INDEX IF NOT EXISTS outreach_send_limits_workspace_idx ON outreach_send_limits(workspace_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON outreach_send_limits;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON outreach_send_limits
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON outreach_send_limits;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach_send_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE outreach_send_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_insert_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_update_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_delete_outreach_send_limits ON outreach_send_limits;
CREATE POLICY ws_select_outreach_send_limits ON outreach_send_limits FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_outreach_send_limits ON outreach_send_limits FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_outreach_send_limits ON outreach_send_limits FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_outreach_send_limits ON outreach_send_limits FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- Reached only via consume_send_quota()/remaining_send_quota() below (both
-- SECURITY DEFINER) — enabled with zero direct policies, matching the
-- platform-settings convention for tables the app never queries directly.
CREATE TABLE IF NOT EXISTS outreach_send_counts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'linkedin')),
  send_date    DATE NOT NULL,
  quota        INTEGER NOT NULL,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, send_date)
);

ALTER TABLE outreach_send_counts ENABLE ROW LEVEL SECURITY;

-- ── consume_send_quota: atomically reserves up to p_requested sends against
-- today's quota for (workspace, channel). Returns how many were actually
-- granted (0..p_requested) — the caller should only send that many leads this
-- pass and let the rest wait for tomorrow's quota. No outreach_send_limits row
-- for this channel → unlimited (returns p_requested unchanged, no row written).
CREATE OR REPLACE FUNCTION consume_send_quota(
  p_workspace_id UUID,
  p_channel      TEXT,
  p_requested    INTEGER
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit   outreach_send_limits%ROWTYPE;
  v_count   outreach_send_counts%ROWTYPE;
  v_today   DATE := CURRENT_DATE;
  v_allowed INTEGER;
  v_granted INTEGER;
BEGIN
  IF p_requested <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN p_requested; -- no limit configured for this channel — unthrottled
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = v_today
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO outreach_send_counts (workspace_id, channel, send_date, quota, sent_count)
    VALUES (
      p_workspace_id, p_channel, v_today,
      v_limit.daily_min + floor(random() * (v_limit.daily_max - v_limit.daily_min + 1))::INTEGER,
      0
    )
    RETURNING * INTO v_count;
  END IF;

  v_allowed := GREATEST(0, v_count.quota - v_count.sent_count);
  v_granted := LEAST(p_requested, v_allowed);

  IF v_granted > 0 THEN
    UPDATE outreach_send_counts SET sent_count = sent_count + v_granted, updated_at = now()
    WHERE id = v_count.id;
  END IF;

  RETURN v_granted;
END;
$$;

-- ── remaining_send_quota: read-only lookup for the Settings UI ("X of Y sent
-- today"). Never grants or consumes anything.
CREATE OR REPLACE FUNCTION remaining_send_quota(
  p_workspace_id UUID,
  p_channel      TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit outreach_send_limits%ROWTYPE;
  v_count outreach_send_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('limited', false);
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'limited', true,
    'daily_min', v_limit.daily_min,
    'daily_max', v_limit.daily_max,
    'quota', v_count.quota,
    'sent_today', COALESCE(v_count.sent_count, 0)
  );
END;
$$;
