-- ============================================================================
-- 0162 — A trialing subscription can never lose its end date
--
-- THE BUG
-- Stripe reports trial_end = null for every subscription it does not consider
-- trialing. Both writers copied that null straight over the date the signup
-- trigger had set:
--   * src/app/api/billing/webhook/route.ts  (direct UPDATE, legacy-price branch)
--   * sync_subscription_from_stripe()       (trial_ends_at = EXCLUDED.trial_ends_at)
-- The result was 19 rows with status='trialing' and trial_ends_at IS NULL.
--
-- WHY THAT MATTERS
-- The expiry guard (0126_secure_billing_rpcs.sql, and its 0125/0150 siblings)
-- blocks only when ALL THREE hold:
--     status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()
-- A NULL fails the second test, so the guard never fires and the trial never
-- expires. Free forever, silently.
--
-- THE FIX — a BEFORE UPDATE trigger rather than rewriting the billing RPC.
-- Deliberate choice:
--   * It covers EVERY writer — the RPC, the webhook's direct update,
--     checkout-return, the Supabase table editor, and anything added later.
--     A fix inside one function only covers that function's callers.
--   * It is additive. Re-declaring sync_subscription_from_stripe() here would
--     overwrite whatever is actually live, and this database has had
--     migrations applied by hand — the file on disk is not a reliable
--     description of the deployed function.
--
-- Losing the date is never useful: it is a historical fact, and once status
-- leaves 'trialing' the guard ignores the column entirely. So "never clear
-- it" costs nothing and closes the hole for good.
-- ============================================================================

CREATE OR REPLACE FUNCTION preserve_trial_ends_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  -- Only ever refuses to ERASE. A real date always wins, so Stripe can still
  -- move a trial end forwards or backwards; it just cannot blank it.
  IF NEW.trial_ends_at IS NULL AND OLD.trial_ends_at IS NOT NULL THEN
    NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_trial_ends_at ON subscriptions;
CREATE TRIGGER trg_preserve_trial_ends_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION preserve_trial_ends_at();

-- Note: the 19 rows that were ALREADY blanked before this trigger existed are
-- repaired separately, as a reviewed data change — 17 of them would otherwise
-- expire the instant a real date is written, so that is not something to bury
-- inside a schema migration.
