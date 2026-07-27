import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recomputeCampaignStats } from "@/lib/email/campaign-stats";
import { webhookSecretValid } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

/**
 * Brevo (Sendinblue) event webhook. Configure it in the Brevo dashboard
 * (Transactional → Settings → Webhook) to point at:
 *   https://YOUR_APP_URL/api/brevo/webhook?secret=<BREVO_WEBHOOK_SECRET>
 * Subscribe to: opened, click, hard_bounce, soft_bounce, blocked.
 *
 * Each email is sent with the campaign id as a Brevo `tag`, so we can attribute
 * the event back to a campaign, log it as a lead activity, and recompute rates.
 */

// Brevo event name -> our lead_activities.activity_type
function mapEvent(event: string): string | null {
  const e = event.toLowerCase();
  if (e.includes("open")) return "EMAIL_OPENED";
  if (e === "click" || e === "clicked") return "EMAIL_CLICKED";
  if (e.includes("bounce") || e === "blocked" || e === "spam" || e === "invalid_email") return "EMAIL_BOUNCED";
  return null;
}

interface BrevoEvent {
  event?: string;
  email?: string;
  tag?: string | string[];
  tags?: string[];
}

/**
 * Brevo echoes our tag back in a few shapes: a plain string, an array, or — most
 * commonly for transactional events — the whole tags array serialized as a
 * string like `["<uuid>"]`. Normalize all of them to the bare campaign id.
 */
function extractCampaignId(ev: BrevoEvent): string | null {
  let raw: unknown = Array.isArray(ev.tags) && ev.tags.length ? ev.tags[0] : ev.tag;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length) return String(arr[0]);
    } catch { /* fall through */ }
  }
  return s || null;
}

export async function POST(request: NextRequest) {
  // Fail closed: an unset BREVO_WEBHOOK_SECRET rejects all calls (was fail-open).
  if (!webhookSecretValid(request.nextUrl.searchParams.get("secret"), process.env.BREVO_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { /* ignore */ }

  // Brevo may send a single event object or a batch under `events`/`items`.
  const events: BrevoEvent[] = Array.isArray(body)
    ? (body as BrevoEvent[])
    : Array.isArray((body as { events?: BrevoEvent[] }).events)
      ? (body as { events: BrevoEvent[] }).events
      : [body as BrevoEvent];

  const db = createAdminClient();
  const touchedCampaigns = new Set<string>();
  let recorded = 0;

  for (const ev of events) {
    const activityType = mapEvent(ev.event || "");
    const email = (ev.email || "").trim().toLowerCase();
    const campaignId = extractCampaignId(ev);
    if (!activityType || !email) continue;

    // A single email can exist on more than one lead row (duplicate imports
    // across repeated campaigns) - an arbitrary first match risks landing on
    // a duplicate that was never actually sent THIS campaign, so the open/
    // click/bounce event gets logged under the wrong lead_id and never joins
    // up with that campaign's own per-lead activity row. When we know the
    // campaign_id (we always do here), prefer whichever duplicate actually
    // has an EMAIL_SENT record for it.
    const { data: candidates } = await db.from("leads").select("id, workspace_id").ilike("email", email);
    let lead = candidates?.[0] ?? null;
    if (candidates && candidates.length > 1 && campaignId) {
      const { data: sentMatch } = await db
        .from("lead_activities")
        .select("lead_id")
        .in("lead_id", candidates.map((c) => c.id))
        .eq("activity_type", "EMAIL_SENT")
        .eq("metadata->>campaign_id", campaignId)
        .limit(1)
        .maybeSingle();
      if (sentMatch?.lead_id) lead = candidates.find((c) => c.id === sentMatch.lead_id) ?? lead;
    }
    if (!lead) continue;

    await db.from("lead_activities").insert({
      lead_id: lead.id,
      workspace_id: lead.workspace_id,
      activity_type: activityType,
      metadata: { campaign_id: campaignId ?? null, source: "brevo", event: ev.event },
    });
    recorded++;
    if (campaignId) touchedCampaigns.add(campaignId);
  }

  for (const id of touchedCampaigns) {
    await recomputeCampaignStats(id).catch(() => {});
  }

  return NextResponse.json({ ok: true, recorded });
}
