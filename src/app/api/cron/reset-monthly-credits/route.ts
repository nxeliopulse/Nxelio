import { NextResponse, type NextRequest } from "next/server";
import { reconcileStaleSubscriptions } from "@/lib/queries/subscription-reconcile";
import { webhookSecretValid } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reconciles subscriptions whose billing period has run out without our
 * webhook hearing about the renewal — re-reading each one from Stripe and
 * refilling the cycle's credits when Stripe confirms the period moved on.
 *
 * Called hourly by Supabase pg_cron (job 'reset-monthly-credits') with:
 *   Authorization: Bearer <OUTREACH_CRON_SECRET>
 *
 * THIS ROUTE DID NOT EXIST. The pg_cron job was scheduled against this exact
 * URL and had been returning 404 hourly — visible only in net._http_response,
 * so nothing surfaced it. The gap it was meant to cover turned out to be
 * real: 11 of 14 'active' rows were found 7-15 days past their period end
 * after Stripe deliveries stopped. Path and job name are kept verbatim so the
 * existing schedule starts working with no cron change.
 *
 * Safety: reconcileStaleSubscriptions grants nothing on its own authority. It
 * asks Stripe for the truth and copies it back, and the credit refill is
 * keyed on the Stripe invoice id — so a refill the webhook already applied is
 * a no-op, and a customer who did not renew gets nothing.
 *
 * 25 per run is deliberate: each row costs a Stripe round-trip, and this runs
 * hourly, so a backlog drains within a few ticks well inside maxDuration.
 */
async function run(request: NextRequest) {
  const secret = process.env.OUTREACH_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!webhookSecretValid(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await reconcileStaleSubscriptions(25);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Reconcile failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

// GET allowed too, for easy manual testing with curl.
export async function GET(request: NextRequest) {
  return run(request);
}
