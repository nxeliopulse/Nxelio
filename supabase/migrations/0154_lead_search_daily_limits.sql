-- ============================================================================
-- Daily cap on Buy Leads / background lead searches, separate from the
-- existing MONTHLY leads_remaining balance (subscriptions.leads_remaining).
-- Starter: 100/day, Pro: 200/day (values live in
-- src/lib/queries/subscriptions.ts's DAILY_LEAD_SEARCH_LIMIT, not here).
--
-- Same shape as outreach_send_limits/outreach_send_counts (0070) and
-- consume_send_quota (0136): a per-workspace, per-calendar-day usage row,
-- checked read-only before creating a job (lead_search_daily_remaining) and
-- incremented only after the job is actually created
-- (increment_lead_search_daily_usage) — two calls instead of one atomic
-- "consume" so a rejected request never has to be rolled back.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_search_daily_usage (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usage_date   DATE NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, usage_date)
);

ALTER TABLE lead_search_daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_lead_search_daily_usage ON lead_search_daily_usage;
CREATE POLICY ws_select_lead_search_daily_usage ON lead_search_daily_usage
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
-- No insert/update policy for authenticated — writes only happen through the
-- SECURITY DEFINER function below, same as outreach_send_counts.

CREATE OR REPLACE FUNCTION lead_search_daily_remaining(p_workspace_id uuid, p_daily_limit integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_used INTEGER;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN 0;
  END IF;
  SELECT count INTO v_used FROM lead_search_daily_usage
  WHERE workspace_id = p_workspace_id AND usage_date = CURRENT_DATE;
  RETURN GREATEST(0, p_daily_limit - COALESCE(v_used, 0));
END;
$$;

CREATE OR REPLACE FUNCTION increment_lead_search_daily_usage(p_workspace_id uuid, p_amount integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN;
  END IF;
  IF p_amount <= 0 THEN RETURN; END IF;
  INSERT INTO lead_search_daily_usage (workspace_id, usage_date, count)
  VALUES (p_workspace_id, CURRENT_DATE, p_amount)
  ON CONFLICT (workspace_id, usage_date)
  DO UPDATE SET count = lead_search_daily_usage.count + EXCLUDED.count, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION lead_search_daily_remaining(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lead_search_daily_remaining(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION increment_lead_search_daily_usage(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_lead_search_daily_usage(uuid, integer) TO authenticated, service_role;
