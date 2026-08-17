import { NextRequest, NextResponse } from "next/server";
import { findAndSaveLeadCompany } from "@/lib/leads/find-company";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const leads = body?.leads as Array<{ id: string; linkedin: string | null; full_name?: string | null }>;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // Limit batch to max 25 leads per request
    const batch = leads.slice(0, 25);

    // Run ALL leads in true parallel concurrency on the server!
    const results = await Promise.all(
      batch.map(async (l) => {
        try {
          const res = await findAndSaveLeadCompany(l.id, l.linkedin, l.full_name);
          return { leadId: l.id, ok: res.ok, companyName: res.companyName, error: res.error, creditsUsed: res.creditsUsed ?? 0, creditsRemaining: res.creditsRemaining };
        } catch (err) {
          return { leadId: l.id, ok: false, error: err instanceof Error ? err.message : "Failed", creditsUsed: 0, creditsRemaining: undefined as number | undefined };
        }
      })
    );

    const successCount = results.filter((r) => r.ok).length;
    const creditsUsed = results.reduce((sum, r) => sum + r.creditsUsed, 0);
    // Lowest reported remaining balance across the batch — since deductions
    // land one at a time, this is the true post-batch balance regardless of
    // which request's response happened to resolve last.
    const remainingValues = results.map((r) => r.creditsRemaining).filter((v): v is number => typeof v === "number");
    const creditsRemaining = remainingValues.length ? Math.min(...remainingValues) : undefined;
    return NextResponse.json({ ok: true, results, successCount, creditsUsed, creditsRemaining });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bulk search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
