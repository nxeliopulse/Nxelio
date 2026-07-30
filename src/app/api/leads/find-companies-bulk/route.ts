import { NextRequest, NextResponse } from "next/server";
import { findAndSaveLeadCompany } from "@/lib/leads/find-company";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const leads = body?.leads as Array<{ id: string; linkedin: string | null; full_name?: string | null }>;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // Limit batch to max 10 leads per request
    const batch = leads.slice(0, 10);

    // Run ALL leads in true parallel concurrency on the server!
    const results = await Promise.all(
      batch.map(async (l) => {
        try {
          const res = await findAndSaveLeadCompany(l.id, l.linkedin, l.full_name);
          return { leadId: l.id, ok: res.ok, companyName: res.companyName, error: res.error };
        } catch (err) {
          return { leadId: l.id, ok: false, error: err instanceof Error ? err.message : "Failed" };
        }
      })
    );

    const successCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, results, successCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bulk search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
