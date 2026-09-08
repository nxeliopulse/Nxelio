-- ============================================================================
-- 0160 — Configurable trial period (platform-wide)
--
-- The trial length was hardcoded in two places that had silently diverged
-- from each other:
--   1. create_workspace_subscription() below  -> INTERVAL '7 days'
--   2. src/app/api/billing/checkout/route.ts  -> trial_period_days: 7
-- Both now read this single row, so the Admin page is the only place the
-- number lives.
--
-- Single-row table (the `id BOOLEAN PRIMARY KEY CHECK (id)` idiom): a second
-- row is impossible, so no code path ever has to pick "the right" settings
-- row or handle a tie.
--
-- The 15..30 range is enforced HERE as well as in the server action. The
-- action gives the admin a readable message; this CHECK is what guarantees a
-- bad value can never land in the table via psql, a future migration, or the
-- Supabase table editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_trial_settings (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  trial_days  INT NOT NULL DEFAULT 15 CHECK (trial_days BETWEEN 15 AND 30),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_trial_settings (id, trial_days) VALUES (TRUE, 15)
ON CONFLICT (id) DO NOTHING;

-- RLS on with NO policies for any role, exactly like feature_kill_switches
-- (0120): only the service-role client can touch this, and the single
-- gateway is src/lib/queries/trial-settings.ts. Tenants must never read or
-- write platform configuration.
ALTER TABLE platform_trial_settings ENABLE ROW LEVEL SECURITY;

-- ── Helper: the configured trial length ─────────────────────────────────────
-- Wrapped in a function so the trigger below (and anything added later) can
-- never accidentally hardcode the number again. Returns the default rather
-- than NULL if the row is somehow missing, so signup can never create a
-- subscription with a NULL trial_ends_at.
CREATE OR REPLACE FUNCTION current_trial_days()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE((SELECT trial_days FROM platform_trial_settings WHERE id), 15);
$$;

-- ── Signup trial now reads the setting ──────────────────────────────────────
-- Replaces the 0029 version verbatim except for the trial length. Note this
-- affects NEW workspaces only: existing subscriptions keep the trial_ends_at
-- they were given, which is the agreed behaviour (changing the setting must
-- not move the goalposts for a customer already mid-trial).
CREATE OR REPLACE FUNCTION create_workspace_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- Schema-qualified: this trigger has no SET search_path (matching the 0029
  -- original), so an unqualified call would depend on the caller's path.
  v_days INT := public.current_trial_days();
  v_ends TIMESTAMPTZ := now() + (v_days || ' days')::interval;
BEGIN
  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    trial_ends_at, current_period_start, current_period_end,
    credits_remaining, credits_total
  ) VALUES (
    NEW.id, 'basic', 'monthly', 'trialing',
    v_ends,
    now(),
    v_ends,
    500, 500
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 500, 'completed',
         jsonb_build_object('note', v_days || '-day Basic trial', 'trial_days', v_days)
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged (0029 created it); CREATE OR REPLACE
-- FUNCTION above is picked up by the existing trigger automatically. Only
-- re-assert it in case a prior migration dropped it.
DROP TRIGGER IF EXISTS on_workspace_created_subscription ON workspaces;
CREATE TRIGGER on_workspace_created_subscription
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_workspace_subscription();

-- ── Trial user-limit support: nothing to add ────────────────────────────────
-- The 3-user cap during trial is a live count of workspace_members, so there
-- is no new column and no "seats used" counter to keep in sync — deleting a
-- member frees a slot for free (the agreed behaviour).
--
-- No index needed either: workspace_members_workspace_idx on
-- (workspace_id) already exists from 0081_workspace_members.sql, which is
-- exactly what the count filters on.
