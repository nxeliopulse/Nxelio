import { NextResponse, type NextRequest } from "next/server";
import { recordDailyPipelineSnapshots } from "@/lib/queries/pipeline-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Records today's open-pipeline totals for every workspace. Called once
 * daily by Supabase pg_cron (see supabase/migrations/0129_pipeline_snapshots.sql)
 * with:
 *   Authorization: Bearer <PIPELINE_SNAPSHOT_CRON_SECRET>
 */
async function run(request: NextRequest) {
  const secret = process.env.PIPELINE_SNAPSHOT_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recordDailyPipelineSnapshots();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Snapshot failed" },
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
