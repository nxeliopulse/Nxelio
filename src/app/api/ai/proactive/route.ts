import { NextResponse, type NextRequest } from "next/server";
import { runProactiveAi } from "@/lib/queries/proactive-ai";
import { webhookSecretValid } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily proactive scan endpoint. Configure pg_cron or an external scheduler
 * with AI_PROACTIVE_CRON_SECRET. OUTREACH_CRON_SECRET is accepted as a
 * compatibility fallback for deployments that already have one scheduler.
 */
async function run(request: NextRequest) {
  const secret = process.env.AI_PROACTIVE_CRON_SECRET || process.env.OUTREACH_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!webhookSecretValid(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace") || undefined;
    return NextResponse.json({ ok: true, ...(await runProactiveAi(workspaceId)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Proactive scan failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
