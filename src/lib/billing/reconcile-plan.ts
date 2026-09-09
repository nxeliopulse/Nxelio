/**
 * Pure reconciliation rules: given our `subscriptions` row and Stripe's copy
 * of the same subscription, decide what (if anything) to write.
 *
 * NO database, network, or Next.js imports live in this file, so the exact
 * same rules run in both places that need them:
 *   1. src/app/api/cron/reset-monthly-credits/route.ts  (the scheduled repair)
 *   2. scripts/reconcile-subscriptions.mjs              (dry run + backfill)
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The Stripe webhook endpoint (we_1TxNFiCRKbhmPQVVTrWZHYjX ->
 * https://nxelio.vercel.app/api/billing/webhook) was found in Stripe's
 * `disabled` state on 2026-09-07. A disabled endpoint receives NOTHING — not
 * a 400, not a retry — so every renewal event since it went dark was dropped.
 * 15 rows drifted out of sync and `credit_ledger` contained zero
 * `cycle_reset` grants, ever.
 *
 * Re-enabling the endpoint fixes the future but not the past: Stripe does not
 * retro-deliver missed events. So the local copy has to be repaired by reading
 * Stripe, and something has to keep watching in case the endpoint is ever
 * disabled again. Hence a reconciler rather than an independent renewer:
 * Stripe is the source of truth and we only repair our copy of it.
 *
 * This deliberately does NOT compute renewals on its own 30-day clock. Doing
 * that would have handed a fresh month of credits to the three customers who
 * had already canceled in Stripe, and would have drifted every billing anchor
 * away from Stripe's.
 */
import { PRICE_ID_TO_PLAN, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { mapStripeStatus } from "@/lib/queries/subscription-types";

/** The `subscriptions` columns these rules read. */
export interface DbSubscriptionRow {
  workspace_id: string;
  plan_id: string;
  billing_interval: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  credits_remaining: number;
  credits_total: number;
  leads_remaining: number;
  leads_total: number;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  last_synced_resource_version: string | null;
}

/** Stripe's copy, flattened to the handful of fields that matter. */
export interface StripeSubscriptionSnapshot {
  id: string;
  status: string;
  customerId: string;
  priceId: string;
  /** Unix seconds. Lives on the subscription *item* since API 2025-03-31.basil. */
  currentPeriodStart: number;
  currentPeriodEnd: number;
  trialEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  /** The invoice that opened the current period — our cycle idempotency key. */
  latestInvoiceId: string | null;
}

/** Args for the `sync_subscription_from_stripe` RPC, named to match it exactly. */
export interface SyncRpcArgs {
  p_workspace_id: string;
  p_plan_id: string;
  p_billing_interval: string;
  p_status: string;
  p_credits_total: number;
  p_leads_total: number;
  p_current_period_start: string;
  p_current_period_end: string;
  p_trial_ends_at: string | null;
  p_stripe_customer_id: string;
  p_stripe_subscription_id: string;
  p_stripe_price_id: string;
  p_cancel_at_period_end: boolean;
  p_canceled_at: string | null;
}

export type ReconcileAction =
  | "renewed" //           Stripe opened a new paid cycle we never recorded
  | "synced" //            status/dates/plan drifted; no new cycle, no credits
  | "unknown_price" //     retired price: repair dates/status only, never plan
  | "missing_in_stripe" // no such subscription in Stripe; never written
  | "unchanged"; //        already in step with Stripe

export interface ReconcileDecision {
  workspaceId: string;
  stripeSubscriptionId: string | null;
  action: ReconcileAction;
  reason: string;
  /** Call `reset_subscription_cycle(workspace_id, idempotencyKey)` FIRST. */
  grantCycle: { idempotencyKey: string; creditsTotal: number; leadsTotal: number } | null;
  /** Then call `sync_subscription_from_stripe` with these args. */
  sync: SyncRpcArgs | null;
  /**
   * Direct column patch instead of the RPC, for the `unknown_price` case only
   * — the RPC needs a plan_id and credit totals we cannot safely guess.
   */
  patch: Record<string, string | boolean | null> | null;
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
}

/** `null` for a null/absent unix timestamp, else an ISO string. */
function iso(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds === null || unixSeconds === undefined) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Compares two timestamps by instant, not by text.
 *
 * Postgres hands back `2026-09-08T03:56:12+00:00` while `toISOString()`
 * produces `2026-09-08T03:56:12.000Z`. Those are the same moment and different
 * strings, so a `!==` on the raw values reports drift on five rows that are
 * perfectly in sync — and the hourly cron would rewrite them forever.
 */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
}

/**
 * Flattens a Stripe subscription (SDK object or raw REST JSON — same shape)
 * into a snapshot. Returns null when the payload carries no usable period,
 * which would otherwise become an `Invalid Date` and a failed write.
 */
export function snapshotFromStripe(raw: Record<string, unknown>): StripeSubscriptionSnapshot | null {
  const items = (raw.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const item = items[0];
  if (!item) return null;

  const start = item.current_period_start as number | undefined;
  const end = item.current_period_end as number | undefined;
  if (typeof start !== "number" || typeof end !== "number") return null;

  const price = item.price as { id?: string } | undefined;
  const customer = raw.customer;
  const latestInvoice = raw.latest_invoice;

  return {
    id: String(raw.id),
    status: String(raw.status),
    customerId: typeof customer === "string" ? customer : String((customer as { id?: string })?.id ?? ""),
    priceId: price?.id ?? "",
    currentPeriodStart: start,
    currentPeriodEnd: end,
    trialEnd: (raw.trial_end as number | null) ?? null,
    cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
    canceledAt: (raw.canceled_at as number | null) ?? null,
    latestInvoiceId:
      typeof latestInvoice === "string"
        ? latestInvoice
        : ((latestInvoice as { id?: string } | null)?.id ?? null),
  };
}

function balanceView(row: DbSubscriptionRow) {
  return {
    status: row.status,
    plan_id: row.plan_id,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    credits: `${row.credits_remaining}/${row.credits_total}`,
    leads: `${row.leads_remaining}/${row.leads_total}`,
  };
}

/**
 * Decides what to do with one subscription.
 *
 * `stripeSub` is null when the row's `stripe_subscription_id` does not resolve
 * in Stripe. We never write in that case: the plausible causes (wrong Stripe
 * mode, deleted test data, a different account) are ambiguous, and guessing
 * would corrupt a live row.
 */
export function decideReconcile(
  row: DbSubscriptionRow,
  stripeSub: StripeSubscriptionSnapshot | null
): ReconcileDecision {
  const base = {
    workspaceId: row.workspace_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    before: balanceView(row),
  };

  if (!stripeSub) {
    return {
      ...base,
      action: "missing_in_stripe",
      reason: "no subscription with this id in Stripe (wrong mode, or deleted) — not written",
      grantCycle: null,
      sync: null,
      patch: null,
      after: null,
    };
  }

  const localStatus = mapStripeStatus(stripeSub.status);
  const periodStartIso = new Date(stripeSub.currentPeriodStart * 1000).toISOString();
  const periodEndIso = new Date(stripeSub.currentPeriodEnd * 1000).toISOString();
  const mapped = PRICE_ID_TO_PLAN[stripeSub.priceId];

  // A strictly newer period start is the only signal we treat as "a new cycle
  // was billed". Stripe keeps the anchor across mid-cycle plan changes, so a
  // proration does not look like a renewal here.
  const dbStartMs = row.current_period_start ? Date.parse(row.current_period_start) : 0;
  const periodAdvanced = Date.parse(periodStartIso) > dbStartMs;

  // Never grant credits to a subscription Stripe considers canceled or unpaid.
  // Three of the drifted rows were canceled in Stripe while still reading
  // `active` locally; a naive 30-day renewer would have topped them all up.
  const payable = localStatus === "active" || localStatus === "trialing";

  // Already granted for this exact invoice. reset_subscription_cycle stores the
  // key in last_synced_resource_version and would no-op anyway, but checking
  // here keeps the dry-run output honest about what will actually happen.
  const cycleKey = stripeSub.latestInvoiceId ?? `${stripeSub.id}:${periodStartIso}`;
  const alreadyGranted = row.last_synced_resource_version === cycleKey;

  if (!mapped) {
    // Retired/legacy price. Mirror the webhook: repair status and dates, and
    // never touch plan_id/credits_total, because we cannot know what this price
    // is worth and guessing "basic" would strip a paying customer's tier.
    return {
      ...base,
      action: "unknown_price",
      reason: `price ${stripeSub.priceId} is not in STRIPE_PRICE_IDS — dates/status only, plan and credits untouched`,
      grantCycle: null,
      sync: null,
      patch: {
        status: localStatus,
        current_period_start: periodStartIso,
        current_period_end: periodEndIso,
        trial_ends_at: iso(stripeSub.trialEnd),
        stripe_customer_id: stripeSub.customerId,
        stripe_subscription_id: stripeSub.id,
        cancel_at_period_end: stripeSub.cancelAtPeriodEnd,
        canceled_at: iso(stripeSub.canceledAt),
        updated_at: new Date().toISOString(),
      },
      after: {
        ...base.before,
        status: localStatus,
        current_period_start: periodStartIso,
        current_period_end: periodEndIso,
      },
    };
  }

  const planId = mapped.planId;
  const creditsTotal = PLAN_CREDITS[planId] ?? 0;
  const leadsTotal = PLAN_LEADS[planId] ?? 0;

  const sync: SyncRpcArgs = {
    p_workspace_id: row.workspace_id,
    p_plan_id: planId,
    p_billing_interval: mapped.interval,
    p_status: localStatus,
    p_credits_total: creditsTotal,
    p_leads_total: leadsTotal,
    p_current_period_start: periodStartIso,
    p_current_period_end: periodEndIso,
    p_trial_ends_at: iso(stripeSub.trialEnd),
    p_stripe_customer_id: stripeSub.customerId,
    p_stripe_subscription_id: stripeSub.id,
    p_stripe_price_id: stripeSub.priceId,
    p_cancel_at_period_end: stripeSub.cancelAtPeriodEnd,
    p_canceled_at: iso(stripeSub.canceledAt),
  };

  if (periodAdvanced && payable && !alreadyGranted) {
    // The renewal we missed. Order matters and matches the webhook exactly:
    // reset_subscription_cycle grants the allowance and writes the ledger row
    // but stamps now()-based dates, then the sync RPC overwrites those with
    // Stripe's real anchor. Reversing the two would drift the billing date.
    return {
      ...base,
      action: "renewed",
      reason: `Stripe opened a new ${mapped.interval} cycle on ${periodStartIso.slice(0, 10)} (invoice ${cycleKey}) that we never recorded`,
      grantCycle: { idempotencyKey: cycleKey, creditsTotal, leadsTotal },
      sync,
      patch: null,
      after: {
        status: localStatus,
        plan_id: planId,
        current_period_start: periodStartIso,
        current_period_end: periodEndIso,
        credits: `${creditsTotal}/${creditsTotal}`,
        leads: `${leadsTotal}/${leadsTotal}`,
      },
    };
  }

  const drifted =
    row.status !== localStatus ||
    row.plan_id !== planId ||
    row.billing_interval !== mapped.interval ||
    !sameInstant(row.current_period_start, periodStartIso) ||
    !sameInstant(row.current_period_end, periodEndIso) ||
    row.stripe_price_id !== stripeSub.priceId ||
    row.cancel_at_period_end !== stripeSub.cancelAtPeriodEnd ||
    !sameInstant(row.canceled_at, iso(stripeSub.canceledAt));

  if (!drifted) {
    return {
      ...base,
      action: "unchanged",
      reason: "already in step with Stripe",
      grantCycle: null,
      sync: null,
      patch: null,
      after: null,
    };
  }

  // Dates/status/plan repair with NO credit grant. sync_subscription_from_stripe
  // preserves credits_remaining unless plan_id actually changed, so a customer
  // who spent credits this cycle keeps their spent balance.
  const reasons: string[] = [];
  if (row.status !== localStatus) reasons.push(`status ${row.status} -> ${localStatus}`);
  if (row.plan_id !== planId) reasons.push(`plan ${row.plan_id} -> ${planId}`);
  if (!sameInstant(row.current_period_end, periodEndIso)) reasons.push(`period_end -> ${periodEndIso.slice(0, 10)}`);
  if (periodAdvanced && !payable) reasons.push("new cycle NOT granted: Stripe status is not active/trialing");
  if (periodAdvanced && alreadyGranted) reasons.push(`cycle ${cycleKey} already granted`);

  return {
    ...base,
    action: "synced",
    reason: reasons.join("; ") || "field drift",
    grantCycle: null,
    sync,
    patch: null,
    after: {
      status: localStatus,
      plan_id: planId,
      current_period_start: periodStartIso,
      current_period_end: periodEndIso,
      credits: `${row.credits_remaining}/${creditsTotal}`,
      leads: `${row.leads_remaining}/${leadsTotal}`,
    },
  };
}
