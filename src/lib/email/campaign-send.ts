"use server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById } from "@/lib/queries/campaigns";
import { getCurrentUserProfile } from "@/lib/queries/users";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { parseCampaignSteps, sendCampaignStepToLead, scheduleCampaignFollowups, AUDIENCE_COLS, type StepLead } from "@/lib/email/campaign-scheduler";
import { revalidatePath } from "next/cache";

const MAX_PER_SEND = 300;

export interface CampaignSendResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  scheduled: number;
  simulated?: boolean;
  error?: string;
}

/**
 * Launches a campaign: sends Step 1 to the whole audience immediately (with the
 * campaign's Brevo tag + inbox/activity logging) and queues each later step at
 * its delay in campaign_jobs. The per-minute cron then drains those follow-ups,
 * stopping a lead's remaining steps once they reply.
 */
export async function sendCampaign(campaignId: string): Promise<CampaignSendResult> {
  const supabase = await createClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign not found" };

  const workspaceId = (campaign as { workspace_id?: string }).workspace_id;
  if (!workspaceId) return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign has no workspace." };

  const steps = parseCampaignSteps(campaign.content, campaign.subject);
  const step1 = steps[0];
  if (!step1 || (!step1.subject && !step1.body)) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "This campaign has no email content yet." };
  }

  // Resolve audience (segment members, or all workspace leads). Email sequences
  // need an email; LinkedIn-first sequences need a LinkedIn URL.
  const reqCol = step1.channel === "linkedin" ? "linkedin" : "email";
  let leads: StepLead[] = [];
  if (campaign.segment_id) {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", campaign.segment_id);
    const ids = (members || []).map((m) => m.lead_id).filter(Boolean);
    if (ids.length) {
      const { data } = await supabase.from("leads").select(AUDIENCE_COLS).in("id", ids).not(reqCol, "is", null);
      leads = (data as unknown as StepLead[]) || [];
    }
  } else {
    const { data } = await supabase.from("leads").select(AUDIENCE_COLS).not(reqCol, "is", null);
    leads = (data as unknown as StepLead[]) || [];
  }

  if (leads.length === 0) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `No recipients with a ${reqCol === "email" ? "email address" : "LinkedIn URL"} in this audience.` };
  }

  const profile = await getCurrentUserProfile().catch(() => null);
  const senderName = (profile as { full_name?: string | null } | null)?.full_name || undefined;

  let sent = 0, failed = 0, skipped = 0, scheduled = 0, simulated = false;
  const launchMs = Date.now();
  const hasFollowups = steps.length > 1;

  for (const lead of leads.slice(0, MAX_PER_SEND)) {
    const r = await sendCampaignStepToLead(supabase, { campaignId, workspaceId, lead, subject: step1.subject, body: step1.body, senderName, channel: step1.channel, action: step1.action });
    if (r.ok) { sent++; if (r.simulated) simulated = true; }
    else if (r.skipped) skipped++;
    else failed++;
    // Schedule follow-ups regardless of step 1's outcome so one skipped step
    // (e.g. a LinkedIn step with no connected account) never strands the sequence.
    if (hasFollowups) {
      await scheduleCampaignFollowups(supabase, { campaignId, workspaceId, leadId: lead.id, steps, launchMs });
      scheduled += steps.length - 1;
    }
  }

  await supabase.from("campaigns").update({
    sent_count: (campaign.sent_count || 0) + sent,
    status: "Active",
  }).eq("id", campaignId);

  await notifyCurrentUser({
    type: "email",
    title: `Campaign "${campaign.campaign_name}" sent`,
    message: `${sent} sent${scheduled ? `, ${scheduled} follow-ups scheduled` : ""}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`,
    link: "/campaigns",
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: sent > 0, sent, failed, skipped, scheduled, simulated, error: sent === 0 ? "No emails were sent." : undefined };
}
