import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recomputeCampaignStats } from "@/lib/email/campaign-stats";

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
  tag?: string;
  tags?: string[];
}

export async function POST(request: NextRequest) {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
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
    const campaignId = ev.tag || (Array.isArray(ev.tags) ? ev.tags[0] : undefined);
    if (!activityType || !email) continue;

    const { data: lead } = await db
      .from("leads")
      .select("id, workspace_id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
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
