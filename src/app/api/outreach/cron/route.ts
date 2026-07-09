import { NextResponse, type NextRequest } from "next/server";
import { processDueJobs } from "@/lib/outreach/processor";
import { processDueCampaignJobs } from "@/lib/email/campaign-scheduler";
import { processDueScheduledCampaigns } from "@/lib/email/campaign-send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the outreach job queue. Called every minute by Supabase pg_cron
 * (see supabase/migrations/0017_outreach_real.sql) with:
 *   Authorization: Bearer <OUTREACH_CRON_SECRET>
 */
async function run(request: NextRequest) {
  const secret = process.env.OUTREACH_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [outreach, campaign, scheduled] = await Promise.all([
      processDueJobs(50),
      processDueCampaignJobs(50),
      processDueScheduledCampaigns(20),
    ]);
    return NextResponse.json({ ok: true, outreach, campaign, scheduled });
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
