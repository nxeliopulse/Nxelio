"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCampaignById, type CampaignRow } from "@/lib/queries/campaigns";
import { getCurrentUserProfile } from "@/lib/queries/users";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { parseCampaignSteps, sendCampaignStepToLead, scheduleCampaignFollowups, fromNameForWorkspace, AUDIENCE_COLS, type StepLead } from "@/lib/email/campaign-scheduler";
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

/** Shared send logic — takes whichever client/campaign the caller already has
 *  (a user-scoped client for a manual launch, or the admin client for the cron
 *  that fires scheduled sends with no user session to scope RLS to). */
async function runCampaignSend(supabase: SupabaseClient, campaign: CampaignRow): Promise<CampaignSendResult> {
  const campaignId = campaign.id;
  const workspaceId = (campaign as { workspace_id?: string }).workspace_id;
  if (!workspaceId) return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign has no workspace." };

  // A campaign's content must be human-approved before it can reach anyone's inbox —
  // this is the real enforcement point, not just a disabled button in the UI.
  if (campaign.approval_status !== "Approved") {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "This campaign must be approved before it can be launched." };
  }

  const steps = parseCampaignSteps(campaign.content, campaign.subject);
  const step1 = steps[0];
  if (!step1 || (!step1.subject && !step1.body)) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `This campaign has no ${step1?.channel === "linkedin" ? "LinkedIn message" : "email"} content yet.` };
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
  // From Name recipients see = the workspace's company name (or "Nxelio").
  const fromName = await fromNameForWorkspace(supabase, workspaceId);

  let sent = 0, failed = 0, skipped = 0, scheduled = 0, simulated = false;
  let lastError: string | undefined;
  const launchMs = Date.now();
  const hasFollowups = steps.length > 1;

  for (const lead of leads.slice(0, MAX_PER_SEND)) {
    const r = await sendCampaignStepToLead(supabase, { campaignId, workspaceId, lead, subject: step1.subject, body: step1.body, senderName, fromName, channel: step1.channel, action: step1.action });
    if (r.ok) { sent++; if (r.simulated) simulated = true; }
    else if (r.skipped) { skipped++; lastError = r.error || lastError; }
    else { failed++; lastError = r.error || lastError; }
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
    approval_status: "Live/Distributing",
  }).eq("id", campaignId);

  const admin = createAdminClient();
  await admin.from("campaign_approval_log").insert({
    campaign_id: campaignId,
    workspace_id: workspaceId,
    from_status: campaign.approval_status,
    to_status: "Live/Distributing",
    changed_by: null, // System — this fires from the send pipeline, not a manual click
  });

  await notifyCurrentUser({
    type: "email",
    title: `Campaign "${campaign.campaign_name}" sent`,
    message: `${sent} sent${scheduled ? `, ${scheduled} follow-ups scheduled` : ""}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`,
    link: "/campaigns",
  });
  await logAudit({
    action: "campaign.sent",
    entityType: "campaign",
    entityId: campaign.id,
    entityLabel: campaign.campaign_name,
    metadata: { sent, failed, skipped, scheduled },
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  const channelLabel = step1.channel === "linkedin" ? "LinkedIn messages" : "emails";
  const noneSentError = lastError ? `No ${channelLabel} were sent — ${lastError}` : `No ${channelLabel} were sent.`;
  return { ok: sent > 0, sent, failed, skipped, scheduled, simulated, error: sent === 0 ? noneSentError : undefined };
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
  return runCampaignSend(supabase, campaign);
}

/**
 * Fires any campaigns whose "Schedule for later" time has arrived. Runs off
 * the per-minute cron with the admin client — there's no user session to scope
 * RLS to at that point, so the lookup and send both need to bypass it.
 */
export async function processDueScheduledCampaigns(limit = 20): Promise<{ launched: number; failed: number }> {
  const admin = createAdminClient();
  const { data: due } = await admin
    .from("campaigns")
    .select("*")
    .eq("status", "Scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(limit);

  let launched = 0, failed = 0;
  for (const campaign of (due || []) as CampaignRow[]) {
    const res = await runCampaignSend(admin, campaign);
    if (res.ok) launched++; else failed++;
  }
  return { launched, failed };
}
