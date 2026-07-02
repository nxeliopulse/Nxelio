"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CampaignEngagement {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

export interface LeadEngagementRow {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
}

interface ActivityRow {
  lead_id: string | null;
  activity_type: string;
  created_at: string;
  leads: { full_name: string | null; company_name: string | null; email: string | null } | null;
}

/**
 * Per-lead, per-event timestamps for one campaign — who was sent to, who opened
 * (and when), who clicked, replied, or bounced. Backs the Analytics tab's
 * activity table so "which leads opened today" is an answerable question, not
 * just an aggregate percentage.
 */
export async function getCampaignLeadActivity(campaignId: string): Promise<LeadEngagementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_activities")
    .select("lead_id, activity_type, created_at, leads(full_name, company_name, email)")
    .eq("metadata->>campaign_id", campaignId)
    .in("activity_type", ["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "EMAIL_REPLIED", "EMAIL_BOUNCED"])
    .order("created_at", { ascending: true });

  const byLead = new Map<string, LeadEngagementRow>();
  for (const row of (data as unknown as ActivityRow[]) ?? []) {
    if (!row.lead_id) continue;
    if (!byLead.has(row.lead_id)) {
      byLead.set(row.lead_id, {
        leadId: row.lead_id,
        leadName: row.leads?.full_name || row.leads?.company_name || "Unknown",
        leadEmail: row.leads?.email ?? null,
        sentAt: null, openedAt: null, clickedAt: null, repliedAt: null, bouncedAt: null,
      });
    }
    const r = byLead.get(row.lead_id)!;
    // Keep the EARLIEST timestamp per event type (rows are already oldest-first).
    if (row.activity_type === "EMAIL_SENT" && !r.sentAt) r.sentAt = row.created_at;
    else if (row.activity_type === "EMAIL_OPENED" && !r.openedAt) r.openedAt = row.created_at;
    else if (row.activity_type === "EMAIL_CLICKED" && !r.clickedAt) r.clickedAt = row.created_at;
    else if (row.activity_type === "EMAIL_REPLIED" && !r.repliedAt) r.repliedAt = row.created_at;
    else if (row.activity_type === "EMAIL_BOUNCED" && !r.bouncedAt) r.bouncedAt = row.created_at;
  }
  return [...byLead.values()].sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""));
}

/**
 * Recomputes a campaign's open / reply / bounce rates from the engagement events
 * recorded against it (lead_activities tagged with the campaign_id, plus inbound
 * inbox replies), and writes them back to the campaign columns the UI reads.
 *
 * Uses the admin client so it works both from an authenticated server action and
 * from the unauthenticated Brevo webhook. It only ever touches the one campaign
 * identified by its (globally-unique) id.
 */
export async function recomputeCampaignStats(campaignId: string): Promise<CampaignEngagement> {
  const db = createAdminClient();

  const { data: campaign } = await db.from("campaigns").select("sent_count").eq("id", campaignId).single();
  const sent = campaign?.sent_count || 0;

  const { data: actsData } = await db
    .from("lead_activities")
    .select("lead_id, activity_type")
    .eq("metadata->>campaign_id", campaignId)
    .in("activity_type", ["EMAIL_OPENED", "EMAIL_CLICKED", "EMAIL_BOUNCED", "EMAIL_REPLIED"]);
  const acts = (actsData || []) as { lead_id: string | null; activity_type: string }[];

  const distinct = (type: string) =>
    new Set(acts.filter((a) => a.activity_type === type).map((a) => a.lead_id)).size;

  const opened = distinct("EMAIL_OPENED");
  const clicked = distinct("EMAIL_CLICKED");
  const bounced = distinct("EMAIL_BOUNCED");

  // Replies: prefer inbound inbox messages for this campaign, fall back to activity events
  const { data: repliesData } = await db
    .from("inbox_messages")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .eq("direction", "inbound");
  const replies = (repliesData || []) as { lead_id: string | null }[];
  const replied = new Set(replies.map((r) => r.lead_id)).size || distinct("EMAIL_REPLIED");

  const pct = (n: number) => (sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0);

  await db.from("campaigns").update({
    open_rate: pct(opened),
    reply_rate: pct(replied),
    bounce_rate: pct(bounced),
  }).eq("id", campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { sent, opened, clicked, replied, bounced };
}

const SIM_SUBJECT = "Re: your email";

export interface SimulateResult extends CampaignEngagement { ok: boolean; error?: string; }

/**
 * DEV / DEMO helper. Generates realistic engagement (opens, clicks, replies,
 * bounces) for a campaign's already-sent recipients so the stat grid populates
 * without a live deployment + email-provider webhook. Re-running replaces the
 * previously-simulated events (it never touches real ones).
 */
export async function simulateCampaignEngagement(campaignId: string): Promise<SimulateResult> {
  const supabase = await createClient();

  const { data: outbound } = await supabase
    .from("inbox_messages")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .eq("direction", "outbound");
  const leadIds = [...new Set((outbound || []).map((o) => o.lead_id).filter(Boolean))] as string[];

  if (leadIds.length === 0) {
    return { ok: false, error: "No sent recipients yet — send the campaign first.", sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
  }

  // Clear previously-simulated engagement so re-running doesn't stack up
  await supabase.from("lead_activities").delete()
    .eq("metadata->>campaign_id", campaignId)
    .eq("metadata->>simulated", "true");
  await supabase.from("inbox_messages").delete()
    .eq("campaign_id", campaignId).eq("direction", "inbound").eq("subject", SIM_SUBJECT);

  const meta = { campaign_id: campaignId, simulated: true };
  const activities: Record<string, unknown>[] = [];
  const inbound: Record<string, unknown>[] = [];

  leadIds.forEach((id, i) => {
    if (i % 3 !== 0) activities.push({ lead_id: id, activity_type: "EMAIL_OPENED", metadata: meta });   // ~66% open
    if (i % 4 === 0) activities.push({ lead_id: id, activity_type: "EMAIL_CLICKED", metadata: meta });   // ~25% click
    if (i % 5 === 0) {                                                                                    // ~20% reply
      activities.push({ lead_id: id, activity_type: "EMAIL_REPLIED", metadata: meta });
      inbound.push({ lead_id: id, campaign_id: campaignId, direction: "inbound", subject: SIM_SUBJECT, body: "Thanks for reaching out — this looks interesting. Can you share more details?", is_read: false });
    }
    if (i % 6 === 5) activities.push({ lead_id: id, activity_type: "EMAIL_BOUNCED", metadata: meta });    // ~16% bounce
  });

  if (activities.length) await supabase.from("lead_activities").insert(activities);
  if (inbound.length) await supabase.from("inbox_messages").insert(inbound);

  const stats = await recomputeCampaignStats(campaignId);
  return { ok: true, ...stats };
}
