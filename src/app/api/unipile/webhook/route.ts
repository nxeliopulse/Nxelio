import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recomputeCampaignStats } from "@/lib/email/campaign-stats";

export const dynamic = "force-dynamic";

/**
 * Unipile messaging webhook. Configure it in the Unipile dashboard to point at:
 *   https://YOUR_APP_URL/api/unipile/webhook?secret=<UNIPILE_WEBHOOK_SECRET>
 * When a lead replies (email or LinkedIn), we stop their sequence, count the
 * reply, log it, and drop the message into the Inbox.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try { payload = await request.json(); } catch { /* ignore */ }

  // Ignore our own outbound messages.
  const eventStr = JSON.stringify(payload).toLowerCase();
  const looksOutbound = eventStr.includes('"direction":"out"') || eventStr.includes("message_sent") || eventStr.includes("mail_sent");
  if (looksOutbound) return NextResponse.json({ ok: true, ignored: "outbound" });

  // Pull any candidate sender identifiers out of the (variably-shaped) payload.
  const candidates = collectIdentifiers(payload);
  const bodyText = pickString(payload, ["body", "message", "text", "snippet", "subject"]) || "Replied";
  if (!candidates.length) return NextResponse.json({ ok: true, ignored: "no-sender" });

  const db = createAdminClient();

  // Resolve the connected account → its workspace + owner mailbox address, so we
  // scope the lead match to the right tenant and ignore our OWN sent mail (the
  // owner's address appearing as a "sender" means it's a message we sent).
  const accountId = pickString(payload, ["account_id"]);
  let scopeWorkspaceId: string | null = null;
  let ownerEmail: string | null = null;
  if (accountId) {
    const { data: acct } = await db.from("outreach_accounts").select("workspace_id, name, identifier").eq("account_id", accountId).maybeSingle();
    scopeWorkspaceId = (acct?.workspace_id as string | null) ?? null;
    ownerEmail = ((acct?.name as string) || (acct?.identifier as string) || "").toLowerCase().trim() || null;
  }

  // Sender emails, excluding the mailbox owner's own address (that's our outbound).
  const emails = candidates.filter((c) => c.includes("@") && c.toLowerCase() !== ownerEmail);
  if (ownerEmail && emails.length === 0) {
    return NextResponse.json({ ok: true, ignored: "own-outbound-mail" });
  }

  let lead: { id: string; workspace_id: string; full_name: string | null; company_name: string | null; email: string | null } | null = null;

  // Match the reply sender to a lead — prefer the connected account's workspace.
  const matchEmail = async (ws: string | null) => {
    if (!emails.length) return null;
    let q = db.from("leads").select("id, workspace_id, full_name, company_name, email").in("email", emails);
    if (ws) q = q.eq("workspace_id", ws);
    const { data } = await q.limit(1);
    return data?.[0] ?? null;
  };
  lead = (await matchEmail(scopeWorkspaceId)) || (await matchEmail(null));

  if (!lead) {
    // try LinkedIn handle match (also workspace-scoped first)
    for (const c of candidates) {
      let q = db.from("leads").select("id, workspace_id, full_name, company_name, email").ilike("linkedin", `%${c}%`);
      if (scopeWorkspaceId) q = q.eq("workspace_id", scopeWorkspaceId);
      const { data } = await q.limit(1);
      if (data?.[0]) { lead = data[0]; break; }
    }
  }
  if (!lead) return NextResponse.json({ ok: true, ignored: "no-matching-lead" });

  // Stop every active enrollment for this lead and count the reply.
  const { data: enrollments } = await db
    .from("outreach_enrollments")
    .select("id, sequence_id")
    .eq("lead_id", lead.id)
    .eq("status", "active");

  for (const e of enrollments ?? []) {
    await db.from("outreach_enrollments").update({ status: "replied", updated_at: new Date().toISOString() }).eq("id", e.id);
    await db.from("outreach_jobs").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("enrollment_id", e.id).eq("status", "pending");
    const { data: seq } = await db.from("outreach_sequences").select("reply_count").eq("id", e.sequence_id).single();
    await db.from("outreach_sequences").update({ reply_count: ((seq?.reply_count as number) ?? 0) + 1 }).eq("id", e.sequence_id);
    await db.from("outreach_activities").insert({
      workspace_id: lead.workspace_id,
      sequence_id: e.sequence_id,
      lead_id: lead.id,
      channel: emails.length ? "email" : "linkedin",
      action: "reply",
      status: "replied",
      detail: bodyText.slice(0, 300),
    });
  }

  // Attribute the reply to the lead's most-recent campaign so the campaign's
  // Reply rate counts it, stop that campaign's remaining follow-ups, and log it.
  const { data: lastOutbound } = await db
    .from("inbox_messages")
    .select("campaign_id")
    .eq("lead_id", lead.id)
    .eq("direction", "outbound")
    .not("campaign_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const replyCampaignId = (lastOutbound?.campaign_id as string | null) ?? null;

  if (replyCampaignId) {
    await db.from("lead_activities").insert({
      lead_id: lead.id, workspace_id: lead.workspace_id,
      activity_type: "EMAIL_REPLIED", metadata: { campaign_id: replyCampaignId, source: "reply" },
    });
    await db.from("campaign_jobs").update({ status: "canceled", last_error: "Lead replied", updated_at: new Date().toISOString() })
      .eq("campaign_id", replyCampaignId).eq("lead_id", lead.id).eq("status", "pending");
    await recomputeCampaignStats(replyCampaignId).catch(() => {});
  }

  // Mirror the reply into the Inbox.
  await db.from("inbox_messages").insert({
    workspace_id: lead.workspace_id,
    lead_id: lead.id,
    campaign_id: replyCampaignId,
    direction: "inbound",
    subject: pickString(payload, ["subject"]) || "Reply",
    body: bodyText.slice(0, 4000),
    is_read: false,
  });

  return NextResponse.json({ ok: true, lead_id: lead.id, stopped: enrollments?.length ?? 0 });
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object") {
      const nested = pickString(v as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return null;
}

/** Recursively gathers email-like and linkedin-handle-like strings from the payload. */
function collectIdentifiers(obj: unknown, acc: Set<string> = new Set(), depth = 0): string[] {
  if (depth > 6 || obj == null) return [...acc];
  if (typeof obj === "string") {
    const s = obj.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) acc.add(s.toLowerCase());
    else if (s.includes("linkedin.com/in/")) acc.add(s.split("/in/").pop()!.split(/[/?]/)[0].toLowerCase());
    return [...acc];
  }
  if (Array.isArray(obj)) { obj.forEach((v) => collectIdentifiers(v, acc, depth + 1)); return [...acc]; }
  if (typeof obj === "object") { Object.values(obj as Record<string, unknown>).forEach((v) => collectIdentifiers(v, acc, depth + 1)); }
  return [...acc];
}
