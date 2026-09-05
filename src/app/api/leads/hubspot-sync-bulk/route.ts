import { NextRequest, NextResponse } from "next/server";
import { syncLeadToHubspot } from "@/lib/hubspot/actions";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ai/security";

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const { allowed, retryAfterMs } = rateLimit(user.id, "hubspotSyncBulk");
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests — please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const leadIds = body?.leadIds as string[];
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const batch = leadIds.slice(0, BATCH_SIZE);
    const hasMore = leadIds.length > BATCH_SIZE;

    const results = await Promise.all(
      batch.map(async (leadId) => {
        const res = await syncLeadToHubspot(leadId);
        return { leadId, ok: res.ok, error: res.error };
      })
    );

    const successCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ ok: true, successCount, failedCount: failed.length, failed, hasMore, processedCount: batch.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bulk HubSpot sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
