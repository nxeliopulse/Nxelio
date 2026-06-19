"use server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById } from "@/lib/queries/campaigns";
import { getCurrentUserProfile } from "@/lib/queries/users";
import { sendEmail } from "@/lib/email/resend";
import { substituteMergeTags } from "@/lib/email/merge-tags";
import { isBlocked } from "@/lib/queries/blocklist";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";

const MAX_PER_SEND = 300;

export interface CampaignSendResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  simulated?: boolean;
  error?: string;
}

interface AudienceLead {
  id: string;
  full_name: string | null;
  company_name: string | null;
  industry: string | null;
  email: string | null;
  interest_area: string | null;
}

/** Pull the opener email (step 1) out of the stored sequence content. */
function firstStep(content: string | null, fallbackSubject: string | null): { subject: string; body: string } {
  if (content) {
    const block = content.split(/\n+\s*---\s*\n+/)[0]?.trim() || "";
    const lines = block.split("\n");
    const header = lines[0] || "";
    // Strip a leading delay label ("Day 1 — ", "2 hours — ", "No delay — ") if present
    const m = header.match(/^.*?\s+—\s+(.*)$/);
    const subject = (m ? m[1] : header) || fallbackSubject || "";
    const body = lines.slice(1).join("\n").trim();
    if (subject || body) return { subject: subject || fallbackSubject || "Hello", body: body || block };
  }
  return { subject: fallbackSubject || "Hello", body: content || "" };
}

/**
 * Sends the campaign's opener email to its whole audience via the email service
 * (Brevo/Resend). Logs each send to the inbox + lead activity, and bumps the
 * campaign's sent count. Multi-step follow-ups (Day 3, Day 7…) require the
 * scheduled queue and are not sent here.
 */
export async function sendCampaign(campaignId: string): Promise<CampaignSendResult> {
  const supabase = await createClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return { ok: false, sent: 0, failed: 0, skipped: 0, error: "Campaign not found" };

  const { subject, body } = firstStep(campaign.content, campaign.subject);
  if (!subject && !body) return { ok: false, sent: 0, failed: 0, skipped: 0, error: "This campaign has no email content yet." };

  // Resolve audience (segment members, or all workspace leads), email required
  let leads: AudienceLead[] = [];
  const cols = "id, full_name, company_name, industry, email, interest_area";
  if (campaign.segment_id) {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", campaign.segment_id);
    const ids = (members || []).map((m) => m.lead_id).filter(Boolean);
    if (ids.length) {
      const { data } = await supabase.from("leads").select(cols).in("id", ids).not("email", "is", null);
      leads = (data as AudienceLead[]) || [];
    }
  } else {
    const { data } = await supabase.from("leads").select(cols).not("email", "is", null);
    leads = (data as AudienceLead[]) || [];
  }

  if (leads.length === 0) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: "No recipients with an email address in this audience." };
  }

  const profile = await getCurrentUserProfile().catch(() => null);
  const senderName = (profile as { full_name?: string | null } | null)?.full_name || undefined;

  let sent = 0, failed = 0, skipped = 0, simulated = false;
  const outbound: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];

  for (const lead of leads.slice(0, MAX_PER_SEND)) {
    if (!lead.email) { skipped++; continue; }
    if (await isBlocked(lead.email)) { skipped++; continue; }
    const subj = substituteMergeTags(subject, lead, senderName);
    const bod = substituteMergeTags(body, lead, senderName);
    const r = await sendEmail({ to: lead.email, subject: subj, text: bod, tags: [campaignId] });
    if (r.ok) {
      sent++;
      if (r.simulated) simulated = true;
      outbound.push({ lead_id: lead.id, campaign_id: campaignId, direction: "outbound", subject: subj, body: bod, is_read: true });
      activities.push({ lead_id: lead.id, activity_type: "EMAIL_SENT", metadata: { campaign_id: campaignId } });
    } else {
      failed++;
    }
  }

  if (outbound.length) await supabase.from("inbox_messages").insert(outbound);
  if (activities.length) await supabase.from("lead_activities").insert(activities);

  await supabase.from("campaigns").update({
    sent_count: (campaign.sent_count || 0) + sent,
    status: "Active",
  }).eq("id", campaignId);

  await notifyCurrentUser({
    type: "email",
    title: `Campaign "${campaign.campaign_name}" sent`,
    message: `${sent} sent${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`,
    link: "/campaigns",
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: sent > 0, sent, failed, skipped, simulated, error: sent === 0 ? "No emails were sent." : undefined };
}
