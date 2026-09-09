-- ============================================================================
-- 0161 — A trialing subscription can never have a NULL trial_ends_at
--
-- THE BUG
-- A NULL trial_ends_at on a `trialing` row is an UNLIMITED FREE TRIAL. The
-- expiry guard inside deduct_credits (0125/0126/0150) only blocks when:
--     status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()
-- so with NULL it never blocks and the trial never ends. The billing page
-- makes it look like the opposite problem, because trialDaysLeft() in
-- src/lib/queries/subscription-types.ts returns 0 when the date is null — so
-- the customer is told "0 days left" while actually spending credits forever.
--
-- WHERE THE NULLs CAME FROM — measured against the live database, not guessed.
-- The signup trigger create_workspace_subscription() was NOT the culprit: it
-- has always set trial_ends_at, and the live copy is the 0160 version. Two
-- separate causes produced the 19 bad rows:
--
--   1. Ad-hoc SQL, 17 rows. 16 of them share updated_at to the millisecond
--      (2026-08-07 05:37:14.866) — one single UPDATE statement — and a 17th
--      was hit alone on 2026-09-05. That statement also normalised
--      credits_total to 400 (basic's credits_per_cycle). It exists in no
--      migration and no script in this repo, so it was typed straight into
--      production. 10 of those rows still carry their original 'trial_grant'
--      credit_ledger entry, proving the trigger had created them correctly
--      and the date was wiped afterwards. Note that
--      supabase_migrations.schema_migrations is EMPTY on this project:
--      migrations here are applied by hand, which is the same gap that let
--      0035 drop the signup trigger while 0038/0039 only replaced the
--      function, leaving no trigger at all until 0160 re-created it.
--
--   2. Two rows inserted 2026-08-30 with trial_ends_at never set at all
--      (150 credits, zero workspace_members, zero users — abandoned signups).
--
-- The Stripe webhook's `sub.trial_end ? ... : null` pattern was NOT the cause
-- of those 19 — every one of them has stripe_subscription_id IS NULL, so the
-- webhook and the sync RPC never touched them. It IS, however, a real bug and
-- a latent cause of exactly this failure: it explains all 12 `active` rows
-- with a NULL date, and it would silently wipe the date on any of the 7
-- currently healthy trialing rows the moment Stripe sent an event reporting
-- no trial. Both halves are fixed: the RPC below, and the direct .update()
-- branch in src/app/api/billing/webhook/route.ts.
--
-- Four layers, so this cannot come back:
--   1. The sync RPC stops overwriting a real date with NULL.
--   2. A BEFORE trigger fills in a date if anything still tries.
--   3. The existing 19 rows are backfilled.
--   4. A CHECK constraint makes the invariant impossible to violate.
-- ============================================================================


-- ── 1. The sync RPC must never overwrite a real date with NULL ──────────────
-- Verbatim from 0150 except for the single COALESCE on trial_ends_at. This is
-- the one choke point for THREE callers that all pass
-- `stripeSub.trial_end ? ... : null`:
--   src/app/api/billing/webhook/route.ts   (subscription.created/updated, invoice.paid)
--   src/app/checkout-return/route.ts       (the post-checkout redirect)
--   src/app/api/billing/checkout/route.ts  (the in-app upgrade path)
-- Fixing it here fixes all three at once, and keeps protecting them if a
-- fourth caller is added later with the same pattern.
--
-- COALESCE rather than "only update when non-null" because there is no
-- legitimate reason for Stripe to CLEAR this column: once a subscription
-- converts, the trial end it had is history worth keeping, and the
-- deduct_credits guard only consults it while status = 'trialing'. Keeping a
-- stale date on an `active` row is harmless; losing a live one is not.
--
-- The COALESCE is resolved into a local variable BEFORE the INSERT, and NOT
-- written as `COALESCE(EXCLUDED.trial_ends_at, subscriptions.trial_ends_at)`
-- in the ON CONFLICT clause. That looks equivalent and is not. In
-- INSERT .. ON CONFLICT DO UPDATE, Postgres fires the BEFORE INSERT triggers
-- on the proposed row *before* it detects the conflict, so the step-2 trigger
-- below would fill the proposed NULL in first; EXCLUDED would then carry that
-- freshly invented date, the COALESCE would never see a NULL, and a real
-- customer's genuine trial end would be overwritten with now() + trial_days
-- on every Stripe event reporting no trial — silently EXTENDING the trial
-- instead of wiping it. Doing the COALESCE against v_existing (already read
-- FOR UPDATE above) makes the proposed row correct before any trigger runs.
CREATE OR REPLACE FUNCTION sync_subscription_from_stripe(
  p_workspace_id UUID,
  p_plan_id TEXT,
  p_billing_interval TEXT,
  p_status TEXT,
  p_credits_total INTEGER,
  p_leads_total INTEGER,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_trial_ends_at TIMESTAMPTZ,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_price_id TEXT,
  p_cancel_at_period_end BOOLEAN,
  p_canceled_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing          subscriptions%ROWTYPE;
  v_plan_changed      BOOLEAN;
  v_credits_remaining INTEGER;
  v_leads_remaining   INTEGER;
  v_trial_ends_at     TIMESTAMPTZ;
  v_sub_id            UUID;
BEGIN
  SELECT * INTO v_existing FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  v_plan_changed      := FOUND AND v_existing.plan_id <> p_plan_id;
  v_credits_remaining := CASE WHEN v_plan_changed OR NOT FOUND THEN p_credits_total ELSE v_existing.credits_remaining END;
  v_leads_remaining   := CASE WHEN v_plan_changed OR NOT FOUND THEN p_leads_total   ELSE v_existing.leads_remaining   END;

  -- THE FIX. Stripe reporting no trial must never destroy a date we already
  -- hold. When there is no existing row, v_existing is all-NULLs and this is
  -- simply p_trial_ends_at.
  v_trial_ends_at     := COALESCE(p_trial_ends_at, v_existing.trial_ends_at);

  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    credits_remaining, credits_total, leads_remaining, leads_total,
    trial_ends_at, current_period_start, current_period_end,
    stripe_customer_id, stripe_subscription_id, stripe_price_id,
    cancel_at_period_end, canceled_at, updated_at
  ) VALUES (
    p_workspace_id, p_plan_id, p_billing_interval, p_status,
    v_credits_remaining, p_credits_total, v_leads_remaining, p_leads_total,
    v_trial_ends_at, p_current_period_start, p_current_period_end,
    p_stripe_customer_id, p_stripe_subscription_id, p_stripe_price_id,
    p_cancel_at_period_end, p_canceled_at, now()
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id                = EXCLUDED.plan_id,
    billing_interval       = EXCLUDED.billing_interval,
    status                 = EXCLUDED.status,
    credits_remaining      = EXCLUDED.credits_remaining,
    credits_total          = EXCLUDED.credits_total,
    leads_remaining        = EXCLUDED.leads_remaining,
    leads_total            = EXCLUDED.leads_total,
    -- EXCLUDED here is v_trial_ends_at, already coalesced against the
    -- existing row above — see the note on trigger ordering in the header.
    trial_ends_at          = EXCLUDED.trial_ends_at,
    current_period_start   = EXCLUDED.current_period_start,
    current_period_end     = EXCLUDED.current_period_end,
    stripe_customer_id     = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id        = EXCLUDED.stripe_price_id,
    cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
    canceled_at            = EXCLUDED.canceled_at,
    updated_at             = now()
  RETURNING id INTO v_sub_id;

  IF v_plan_changed THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub_id, 'plan_change', p_credits_total, 'credits', 'completed',
            jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    IF p_leads_total > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub_id, 'plan_change', p_leads_total, 'leads', 'completed',
              jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    END IF;
  END IF;
END;
$$;

-- CREATE OR REPLACE keeps existing privileges, but re-assert them so this
-- migration is also correct on a database where the function is new.
REVOKE EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;


-- ── 2. Backstop: fill the date in rather than let a NULL land ───────────────
-- Deliberately a defaulting trigger, and NOT a bare CHECK as the first line
-- of defence. On a live billing table the two failure modes are not
-- symmetric:
--   * a rejected write breaks a signup or makes a Stripe webhook return 500,
--     and Stripe then retries a payload we will keep rejecting;
--   * a defaulted write costs the customer, at worst, a trial that ends on a
--     slightly different day than intended.
-- The second is plainly the better failure. RAISE WARNING leaves a trail in
-- the Postgres log so a code path that relies on this stays findable instead
-- of being silently papered over.
--
-- Keeping the OLD date takes priority over inventing a new one. An UPDATE
-- that nulls the column is precisely cause 1 — the ad-hoc statement of
-- 2026-08-07 — and for those rows the correct date was already sitting in the
-- row being overwritten. Had this trigger existed then, it would have kept
-- every one of them and there would have been nothing to backfill. Only when
-- there is genuinely nothing to preserve (an INSERT, or an UPDATE of a row
-- that was already NULL) is a date invented.
CREATE OR REPLACE FUNCTION ensure_trial_ends_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.status = 'trialing' AND NEW.trial_ends_at IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.trial_ends_at IS NOT NULL THEN
      NEW.trial_ends_at := OLD.trial_ends_at;
      RAISE WARNING
        'subscriptions.trial_ends_at was being set to NULL for trialing workspace % — kept the existing % instead (see 0161)',
        NEW.workspace_id, OLD.trial_ends_at;
    ELSE
      NEW.trial_ends_at := now() + (public.current_trial_days() || ' days')::interval;
      RAISE WARNING
        'subscriptions.trial_ends_at was NULL for trialing workspace % with no prior value — defaulted to % (see 0161)',
        NEW.workspace_id, NEW.trial_ends_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE INSERT *and* UPDATE: cause 1 above was an UPDATE, cause 2 an INSERT.
-- Fires before subscriptions_updated_at (0029) purely by alphabetical order;
-- the two set different fields, so the order does not matter.
DROP TRIGGER IF EXISTS subscriptions_ensure_trial_ends_at ON subscriptions;
CREATE TRIGGER subscriptions_ensure_trial_ends_at
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION ensure_trial_ends_at();


-- ── 3. Backfill the existing trialing rows ──────────────────────────────────
-- The honest date for each row is created_at + the configured trial length,
-- but for 17 of the 19 that lands in the PAST (they were created 29 Jun –
-- 14 Jul, and the trial actually offered back then was the old 7-day one, so
-- their trials genuinely ended in July). Writing the bare past date would
-- expire them the instant they next spend a credit, with no warning.
--
-- GREATEST(honest date, now() + 7 days) is therefore the rule: the true date
-- wherever it is still in the future, and a 7-day notice floor otherwise. So
-- no row is retroactively shortened below today, and no row keeps an
-- open-ended trial. Why 7 days:
--
--   * Requirement. The brief for this fix was explicit that nobody should be
--     retroactively shortened below today. A floor honours that; writing the
--     raw past date would not.
--   * Legal. These are free trials with no card on file (all 19 have
--     stripe_customer_id IS NULL), so no payment was taken and no paid term
--     is being cut short — the exposure is low either way. But withdrawing
--     access with zero notice is the one version of this that invites a
--     complaint, and "reasonable notice" is a standard that costs us nothing
--     to meet. 7 days also mirrors the trial length these particular users
--     were originally offered, which makes it easy to defend as a
--     replacement trial rather than a takeaway.
--   * Industry practice. A 7–14 day grace period, when a provider-side
--     billing error has kept access alive past its term, is the normal
--     remedy; dormant free trials are then simply allowed to lapse. What is
--     NOT normal practice is granting a fresh FULL trial (here 15 days) to
--     accounts dormant for two months — that would prolong the very hole
--     this migration exists to close, for 16 rows with zero credits used and
--     no activity since early July.
--
-- Only status = 'trialing' is touched. The 12 `active` rows with a NULL date
-- are left exactly as they are: the guard never consults the column outside a
-- trial, so writing a fabricated trial end onto a paying customer would add
-- misleading data for no benefit. Step 1 stops new ones appearing.
DO $$
DECLARE
  v_count INT;
  v_days  INT := public.current_trial_days();
BEGIN
  WITH updated AS (
    UPDATE subscriptions
    SET trial_ends_at = GREATEST(
          created_at + (v_days || ' days')::interval,
          now() + INTERVAL '7 days'
        ),
        updated_at = now()
    WHERE status = 'trialing'
      AND trial_ends_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;

  RAISE NOTICE '0161: backfilled trial_ends_at on % trialing subscription row(s) (trial length = % days, 7-day notice floor applied where the true date had already passed)', v_count, v_days;
END $$;


-- ── 4. Make the invariant impossible to break ───────────────────────────────
-- Safe to add only now that step 3 has cleared the existing violations, and
-- guaranteed never to fire in practice because step 2 repairs the row first.
-- It is here as a hard stop against a future ad-hoc UPDATE run straight
-- against production — which is exactly how 17 of these 19 rows were created,
-- and something no amount of application-side care can prevent.
--
-- Scoped to status = 'trialing' on purpose: `active`, `past_due` and
-- `canceled` rows are all legitimately allowed a NULL trial_ends_at.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_trialing_needs_trial_end;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_trialing_needs_trial_end
  CHECK (status <> 'trialing' OR trial_ends_at IS NOT NULL);
