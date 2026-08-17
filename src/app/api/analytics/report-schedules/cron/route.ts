import { NextResponse, type NextRequest } from "next/server";
import { runDueReportSchedules } from "@/lib/queries/report-schedules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends any due scheduled report (see supabase/migrations/0131_report_schedules.sql)
 * as a CSV email. Called hourly by Supabase pg_cron with:
 *   Authorization: Bearer <REPORT_SCHEDULE_CRON_SECRET>
 */
async function run(request: NextRequest) {
  const secret = process.env.REPORT_SCHEDULE_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDueReportSchedules();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Report schedule run failed" },
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
