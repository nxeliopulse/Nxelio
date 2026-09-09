/**
 * POST|GET /api/cron/reset-monthly-credits
 *
 * Safety net for the Stripe webhook. Reads Stripe as the source of truth and
 * repairs any `subscriptions` row that has drifted — renewals we never
 * recorded, statuses that moved (trial converted, subscription canceled), and
 * period dates that are stale.
 *
 * Called hourly by Supabase pg_cron (jobid 2). That job already existed and
 * had been 404ing every hour since it was created, because this route was
 * never built. See supabase/migrations/0162_billing_reconcile_cron.sql for the
 * schedule, which needs re-creating to add the Authorization header.
 *
 * ── Why a reconciler and not a renewer ─────────────────────────────────────
 * On 2026-09-07 the Stripe webhook endpoint was found `disabled` in Stripe, so
 * Stripe had been delivering nothing at all. 15 rows were wrong and
 * `credit_ledger` held zero `cycle_reset` grants.
 *
 * The tempting fix — renew every subscription whose period_end has passed, on
 * our own 30-day clock — is wrong. Three of those 15 rows were already
 * canceled in Stripe, so that logic would have granted a fresh month of
 * credits to customers who had stopped paying, and would have drifted every
 * billing anchor off Stripe's. This route only ever copies Stripe's answer.
 *
 * This does NOT replace the webhook. The webhook reacts in seconds; this
 * closes gaps within the hour and makes a repeat of the outage self-healing.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { webhookSecretValid } from "@/lib/webhook-auth";
import {
  decideReconcile,
  snapshotFromStripe,
  type DbSubscriptionRow,
  type ReconcileAction,
  type ReconcileDecision,
} from "@/lib/billing/reconcile-plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stripe pages of 100; cap the work so one run can never hang the cron. */
const MAX_STRIPE_PAGES = 20;

/**
 * Every Stripe subscription in the account, keyed by id.
 *
 * Listing beats retrieving each row one at a time: it is a handful of calls
 * regardless of customer count, and `status: "all"` is what surfaces the
 * canceled subscriptions still reading `active` locally — a per-row fetch
 * driven by "period_end has passed" would miss those entirely, which is
 * exactly how one of the 15 bad rows escaped the original report.
 */
async function fetchAllStripeSubscriptions() {
  const sc = stripe();
  const byId = new Map<string, Record<string, unknown>>();
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_STRIPE_PAGES; page++) {
    const res = await sc.subscriptions.list({
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const sub of res.data) byId.set(sub.id, sub as unknown as Record<string, unknown>);
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
  }

  return byId;
}

/** Applies one decision. Returns null on success, or the error message. */
async function applyDecision(
  admin: ReturnType<typeof createAdminClient>,
  decision: ReconcileDecision
): Promise<string | null> {
  // Credit grant first, then the sync that corrects its now()-based dates.
  // Same order as the webhook's invoice.paid branch; see reconcile-plan.ts.
  if (decision.grantCycle) {
    const { error } = await admin.rpc("reset_subscription_cycle", {
      p_workspace_id: decision.workspaceId,
      p_idempotency_key: decision.grantCycle.idempotencyKey,
    });
    if (error) return `reset_subscription_cycle: ${error.message}`;
  }

  if (decision.sync) {
    const { error } = await admin.rpc("sync_subscription_from_stripe", decision.sync);
    if (error) return `sync_subscription_from_stripe: ${error.message}`;
  }

  if (decision.patch) {
    const { error } = await admin
      .from("subscriptions")
      .update(decision.patch)
      .eq("workspace_id", decision.workspaceId);
    if (error) return `update: ${error.message}`;
  }

  return null;
}

async function run(request: NextRequest) {
  // Prefers a dedicated secret; falls back to the one the other pg_cron jobs
  // already send so this route works without a second env var. Fails closed
  // when neither is set — webhookSecretValid() rejects an empty secret.
  const secret = process.env.BILLING_CRON_SECRET || process.env.OUTREACH_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!webhookSecretValid(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ?dryRun=1 reports what would change without writing. Safe to curl by hand.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const admin = createAdminClient();

    const { data: rows, error: readError } = await admin
      .from("subscriptions")
      .select("*")
      .not("stripe_subscription_id", "is", null);

    if (readError) {
      return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    }

    const stripeSubs = await fetchAllStripeSubscriptions();

    const counts: Record<ReconcileAction, number> = {
      renewed: 0,
      synced: 0,
      unknown_price: 0,
      missing_in_stripe: 0,
      unchanged: 0,
    };
    const changes: Array<Record<string, unknown>> = [];
    const errors: Array<{ workspaceId: string; error: string }> = [];

    for (const row of (rows ?? []) as DbSubscriptionRow[]) {
      const raw = row.stripe_subscription_id ? stripeSubs.get(row.stripe_subscription_id) : undefined;
      const decision = decideReconcile(row, raw ? snapshotFromStripe(raw) : null);
      counts[decision.action]++;

      if (decision.action === "unchanged" || decision.action === "missing_in_stripe") {
        if (decision.action === "missing_in_stripe") {
          // Never written, but worth surfacing: it means our row points at a
          // subscription this Stripe account does not have.
          console.warn(
            `[cron/reset-monthly-credits] workspace ${decision.workspaceId} references ` +
              `${decision.stripeSubscriptionId}, absent from Stripe — skipped`
          );
        }
        continue;
      }

      if (!dryRun) {
        const failure = await applyDecision(admin, decision);
        if (failure) {
          console.error(`[cron/reset-monthly-credits] ${decision.workspaceId}: ${failure}`);
          errors.push({ workspaceId: decision.workspaceId, error: failure });
          continue;
        }
      }

      changes.push({
        workspaceId: decision.workspaceId,
        action: decision.action,
        reason: decision.reason,
        before: decision.before,
        after: decision.after,
      });
    }

    if (changes.length > 0) {
      console.log(
        `[cron/reset-monthly-credits] ${dryRun ? "would repair" : "repaired"} ${changes.length} row(s): ` +
          JSON.stringify(counts)
      );
    }

    return NextResponse.json({
      ok: errors.length === 0,
      dryRun,
      scanned: rows?.length ?? 0,
      stripeSubscriptions: stripeSubs.size,
      counts,
      changes,
      errors,
    });
  } catch (err) {
    console.error("[cron/reset-monthly-credits] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Reconcile failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

// GET allowed too, for manual checks with curl (pair it with ?dryRun=1).
export async function GET(request: NextRequest) {
  return run(request);
}
