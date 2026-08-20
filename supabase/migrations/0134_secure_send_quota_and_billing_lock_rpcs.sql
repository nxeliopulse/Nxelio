-- ============================================================================
-- 0134_secure_send_quota_and_billing_lock_rpcs.sql
--
-- 0126_secure_billing_rpcs.sql locked down deduct_credits/deduct_leads/
-- redeem_promotion_start/redeem_promotion_finalize (called via PostgREST
-- with a client-supplied workspace_id, never checked against the caller's
-- own workspace, never revoked from PUBLIC). Two more functions in the
-- same original migration (0028_subscriptions.sql) have the identical gap
-- and were missed by that pass:
--
-- 1. consume_send_quota — called via the user-token client (manual campaign
--    launch) as well as the admin client (scheduled-send cron), exactly the
--    same mixed calling pattern deduct_credits already has. Any authenticated
--    user could call it directly via PostgREST with another workspace's id
--    to burn or reset that workspace's daily send quota. Fixed the same way:
--    checked against get_current_workspace_id() only when there's a real
--    logged-in caller (service-role calls have no JWT, so the check is
--    skipped there — trusted since only our own server code holds that key).
--
-- 2. claim_billing_op — has no caller anywhere in the app today (grep
--    confirms), but ships with the same missing check and default-open
--    PUBLIC grant as the others. Fixed the same way and locked to
--    service_role only, since nothing legitimate calls it as an
--    authenticated user yet — a future caller needs an explicit grant here,
--    which is the safe failure mode.
-- ============================================================================

-- ── consume_send_quota: ownership check + REVOKE/GRANT ─────────────────────
CREATE OR REPLACE FUNCTION consume_send_quota(p_workspace_id uuid, p_channel text, p_requested integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit   outreach_send_limits%ROWTYPE;
  v_count   outreach_send_counts%ROWTYPE;
  v_today   DATE := CURRENT_DATE;
  v_allowed INTEGER;
  v_granted INTEGER;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN 0;
  END IF;

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

REVOKE EXECUTE ON FUNCTION consume_send_quota(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_send_quota(uuid, text, integer) TO authenticated, service_role;

-- ── claim_billing_op: ownership check + service_role-only ──────────────────
CREATE OR REPLACE FUNCTION claim_billing_op(p_workspace_id uuid, p_stale_after_seconds integer DEFAULT 20) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claimed BOOLEAN := false;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN false;
  END IF;

  UPDATE subscriptions
  SET billing_op_lock_at = now()
  WHERE workspace_id = p_workspace_id
    AND (billing_op_lock_at IS NULL OR billing_op_lock_at < now() - (p_stale_after_seconds || ' seconds')::interval)
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_billing_op(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_billing_op(uuid, integer) TO service_role;
