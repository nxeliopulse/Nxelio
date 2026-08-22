import { NextResponse, type NextRequest } from "next/server";
import { processDueLeadSearchJobs } from "@/lib/leads/lead-search-jobs";
import { webhookSecretValid } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the lead search job queue. Called every minute by Supabase pg_cron
 * (see supabase/migrations/0137_lead_search_jobs.sql) with:
 *   Authorization: Bearer <LEAD_SEARCH_CRON_SECRET>
 */
async function run(request: NextRequest) {
  const secret = process.env.LEAD_SEARCH_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!webhookSecretValid(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processDueLeadSearchJobs(3);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Processing failed" },
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
