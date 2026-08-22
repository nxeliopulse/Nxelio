"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCampaignById, type CampaignRow } from "@/lib/queries/campaigns";
import { getCurrentUserProfile } from "@/lib/queries/users";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { parseCampaignSteps, sendCampaignStepToLead, scheduleCampaignFollowups, fromNameForWorkspace, AUDIENCE_COLS, type StepLead } from "@/lib/email/campaign-scheduler";
import { consumeSendQuota } from "@/lib/outreach/send-quota";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";
import { revalidatePath } from "next/cache";
import { isSuppressed } from "@/lib/segments";
import { createEnrollments, advanceEnrollmentStep, completeEnrollment, checkAndCompleteCampaign } from "@/lib/campaigns/enrollment";
import { isFeatureEnabledForCurrentUser, isFeatureEnabledForSystem } from "@/lib/queries/feature-kill-switches";

const MAX_PER_SEND = 300;
/** Credits charged per lead for launching a (sequence) campaign send. */
const CREDITS_PER_CAMPAIGN_LEAD = 2;

export interface CampaignSendResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  scheduled: number;
  /** Leads held back by today's daily sending limit — queued to send once quota frees up. */
  deferred?: number;
  simulated?: boolean;
  error?: string;
}

/** Shared send logic — takes whichever client/campaign the caller already has
 *  (a user-scoped client for a manual launch, or the admin client for the cron
 *  that fires scheduled sends with no user session to scope RLS to). */
async function runCampaignSend(supabase: SupabaseClient, campaign: CampaignRow, includeLeadIds?: string[]): Promise<CampaignSendResult> {
  const campaignId = campaign.id;
  const workspaceId = (campaign as { workspace_id?: string }).workspace_id;
  if (!workspaceId) return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign has no workspace." };

  // A campaign's content must be human-approved before it can reach anyone's inbox —
  // this is the real enforcement point, not just a disabled button in the UI.
  // Campaigns created with "requires approval" unchecked skip this gate entirely.
  if (campaign.requires_approval && campaign.approval_status !== "Approved") {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "This campaign must be approved before it can be launched." };
  }

  const steps = parseCampaignSteps(campaign.content, campaign.subject);
  const step1 = steps[0];
  if (!step1 || (!step1.subject && !step1.body)) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `This campaign has no ${step1?.channel === "linkedin" ? "LinkedIn message" : "email"} content yet.` };
  }

  // Which channel(s) this campaign actually needs to send with — not just "is
  // anything connected". Connecting only LinkedIn must not let an Email sequence
  // through, and vice versa. Re-checked here (not just at create/edit time)
  // because an account can be disconnected after a campaign was scheduled.
  // Scoped explicitly to this campaign's workspace_id via the query itself (not
  // hasConnectedOutreachChannel(), which relies on RLS+cookies) because the cron
  // path calls this with the admin client, which bypasses RLS and would
  // otherwise see every workspace's connected accounts.
  const usedChannels = [...new Set(steps.map((s) => s.channel))];
  const { data: connectedRows } = await supabase
    .from("outreach_accounts")
    .select("channel")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .in("channel", usedChannels);
  const connectedChannels = new Set((connectedRows || []).map((r) => r.channel as string));
  const missingChannel = usedChannels.find((c) => !connectedChannels.has(c));
  if (missingChannel) {
    return {
      ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0,
      error: `Connect ${missingChannel === "linkedin" ? "a LinkedIn" : "an email"} account before launching this campaign — this sequence uses ${missingChannel === "linkedin" ? "LinkedIn" : "Email"} steps.`,
    };
  }

  // A campaign's audience is a snapshot taken at launch, never a live segment
  // re-resolved on every send — re-clicking Launch on an already-Active campaign
  // must never re-enroll/re-send to leads added to the segment afterward. This
  // is the authoritative server-side guard; the "Launch" button is also disabled
  // client-side once Active, but that alone isn't enough (an API call could
  // still bypass it), so it's enforced here too.
  //
  // Claimed atomically and BEFORE resolving the audience or sending anything —
  // an exception partway through a previous attempt (or a concurrent/retried
  // call) left the campaign at its pre-launch status until the very end of a
  // successful run, so a crash mid-send never tripped this guard and the next
  // cron tick would resend to the whole audience again. The UPDATE...WHERE
  // only ever succeeds for one caller since Postgres locks the row during the
  // update itself.
  const { data: claimed } = await supabase
    .from("campaigns")
    .update({ status: "Active" })
    .eq("id", campaignId)
    .neq("status", "Active")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "This campaign has already launched — its audience is locked to who was enrolled at launch time." };
  }

  // Resolve audience (segment members, or all workspace leads). Email sequences
  // need an email; LinkedIn-first sequences need a LinkedIn URL.
  const reqCol = step1.channel === "linkedin" ? "linkedin" : "email";
  let matchedLeads: StepLead[] = [];
  if (campaign.segment_id) {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", campaign.segment_id);
    const ids = (members || []).map((m) => m.lead_id).filter(Boolean);
    if (ids.length) {
      const { data } = await supabase.from("leads").select(AUDIENCE_COLS).in("id", ids).not(reqCol, "is", null).neq(reqCol, "");
      matchedLeads = (data as unknown as StepLead[]) || [];
    }
  } else {
    const { data } = await supabase.from("leads").select(AUDIENCE_COLS).not(reqCol, "is", null).neq(reqCol, "");
    matchedLeads = (data as unknown as StepLead[]) || [];
  }

  if (matchedLeads.length === 0) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `No recipients with a ${reqCol === "email" ? "email address" : "LinkedIn URL"} in this audience.` };
  }

  // Split-and-send (Phase 4A) — Draft campaigns may launch to a chosen subset
  // of the matched audience instead of all of it (default: everyone included).
  // Excluded leads are never enrolled at all, so they're simply not part of
  // this campaign going forward — not suppressed, not paused, just untouched.
  if (includeLeadIds) {
    const includeSet = new Set(includeLeadIds);
    matchedLeads = matchedLeads.filter((l) => includeSet.has(l.id));
    if (matchedLeads.length === 0) {
      return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "No prospects were selected to launch to." };
    }
  }

  // Eligibility Service (Phase 4B) — one enrollment record per matched lead
  // (suppressed/already-active ones land as non-"active" so they're visible
  // in the Enrollment Monitor with a real reason, never silently dropped),
  // then only the real ELIGIBLE subset actually gets sent to below. This is
  // the fix for campaign sends never having rechecked suppression before.
  await createEnrollments(campaignId, campaign.segment_id ?? null, matchedLeads);
  const leads = matchedLeads.filter((l) => !isSuppressed(l));

  if (leads.length === 0) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `All ${matchedLeads.length} matched leads are suppressed (unsubscribed, do-not-contact, or bounced).` };
  }

  const profile = await getCurrentUserProfile().catch(() => null);
  const senderName = (profile as { full_name?: string | null } | null)?.full_name || undefined;
  // From Name recipients see = the workspace's company name (or "Nxelio Nurture").
  const fromName = await fromNameForWorkspace(supabase, workspaceId);

  let sent = 0, failed = 0, skipped = 0, scheduled = 0, deferred = 0, simulated = false;
  let lastError: string | undefined;
  const launchMs = Date.now();
  const hasFollowups = steps.length > 1;

  // Daily sending limit (Settings > Email / LinkedIn — opt-in, see migration
  // 0070). No limit configured for this channel → allowedNow === batch.length,
  // i.e. today's existing unthrottled behavior, unchanged.
  const batch = leads.slice(0, MAX_PER_SEND);

  // AI-credit gate: sending a campaign costs credits per lead, same "check
  // before you spend" pattern as ai/actions.ts. Checked (and status-gated,
  // since canAfford already returns false for a non-active/trialing
  // subscription) before consuming today's send quota, so a blocked send
  // never burns quota it never actually used.
  if (!(await canAfford(CREDITS_PER_CAMPAIGN_LEAD * batch.length))) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: `You don't have enough AI credits to send this campaign to ${batch.length} lead${batch.length === 1 ? "" : "s"} (${CREDITS_PER_CAMPAIGN_LEAD} credits/lead). Upgrade your plan or wait for your next cycle.` };
  }

  const allowedNow = await consumeSendQuota(supabase, workspaceId, step1.channel, batch.length);
  const sendNow = batch.slice(0, allowedNow);
  const deferToday = batch.slice(allowedNow);

  for (const lead of sendNow) {
    const r = await sendCampaignStepToLead(supabase, { campaignId, workspaceId, lead, subject: step1.subject, body: step1.body, senderName, fromName, channel: step1.channel, action: step1.action });
    if (r.ok) { sent++; if (r.simulated) simulated = true; }
    else if (r.skipped) { skipped++; lastError = r.error || lastError; }
    else { failed++; lastError = r.error || lastError; }
    // Schedule follow-ups regardless of step 1's outcome so one skipped step
    // (e.g. a LinkedIn step with no connected account) never strands the sequence.
    if (hasFollowups) {
      await scheduleCampaignFollowups(supabase, { campaignId, workspaceId, leadId: lead.id, steps, launchMs });
      scheduled += steps.length - 1;
      await advanceEnrollmentStep(campaignId, lead.id, 1, new Date(launchMs + steps[1].delayMin * 60_000).toISOString());
    } else {
      await completeEnrollment(campaignId, lead.id);
    }
  }

  // Leads beyond today's quota: queue their opener as a step-1 job instead of
  // sending it now, so the per-minute cron delivers it once quota frees up
  // rather than silently dropping them. Follow-ups still queue relative to
  // launch, same as sent/skipped/failed leads above.
  if (deferToday.length) {
    await supabase.from("campaign_jobs").insert(deferToday.map((lead) => ({
      campaign_id: campaignId, workspace_id: workspaceId, lead_id: lead.id,
      step_order: 1, channel: step1.channel, action: step1.action,
      subject: step1.subject, body: step1.body,
      run_at: new Date(launchMs + 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
    })));
    deferred = deferToday.length;
    if (hasFollowups) {
      for (const lead of deferToday) {
        await scheduleCampaignFollowups(supabase, { campaignId, workspaceId, leadId: lead.id, steps, launchMs });
        scheduled += steps.length - 1;
      }
    }
  }

  // Best-effort post-launch deduction — mirrors chargeCredits() in
  // ai/actions.ts: the emails have already gone out (or are queued), so a
  // deduction failure here should never hide that from the caller.
  try {
    const res = await deductCredits("campaign_send", CREDITS_PER_CAMPAIGN_LEAD * batch.length, { campaignId });
    if (!res.ok) console.error("[campaign-send/credits] deduct failed:", res.error);
  } catch (err) {
    console.error("[campaign-send/credits] deduct threw:", err);
  }

  await supabase.from("campaigns").update({
    sent_count: (campaign.sent_count || 0) + sent,
    approval_status: "Live/Distributing",
  }).eq("id", campaignId);

  // Single-step campaigns (no follow-ups) can finish immediately in this
  // very call — completeEnrollment() above may have already closed out
  // every lead, so check right away instead of leaving status stuck on
  // "Active" until some later action happens to notice.
  await checkAndCompleteCampaign(campaignId);

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
    message: `${sent} sent${scheduled ? `, ${scheduled} follow-ups scheduled` : ""}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}${deferred ? `, ${deferred} queued for tomorrow (daily limit reached)` : ""}.`,
    link: "/campaigns",
  });
  await logAudit({
    action: "campaign.sent",
    entityType: "campaign",
    entityId: campaign.id,
    entityLabel: campaign.campaign_name,
    metadata: { sent, failed, skipped, scheduled, deferred },
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  const channelLabel = step1.channel === "linkedin" ? "LinkedIn messages" : "emails";
  const noneSentError = deferred
    ? `Today's ${channelLabel} sending limit is already reached — all ${deferred} will send automatically once it resets.`
    : lastError ? `No ${channelLabel} were sent — ${lastError}` : `No ${channelLabel} were sent.`;
  return { ok: sent > 0 || deferred > 0, sent, failed, skipped, scheduled, deferred, simulated, error: sent === 0 && deferred === 0 ? noneSentError : undefined };
}

/**
 * Launches a campaign: sends Step 1 to the whole audience immediately (with the
 * campaign's Brevo tag + inbox/activity logging) and queues each later step at
 * its delay in campaign_jobs. The per-minute cron then drains those follow-ups,
 * stopping a lead's remaining steps once they reply.
 */
export async function sendCampaign(campaignId: string, includeLeadIds?: string[]): Promise<CampaignSendResult> {
  // Real enforcement, not just a disabled "Launch" button — the platform
  // admin can still bypass this themselves (isFeatureEnabledForCurrentUser),
  // everyone else is blocked outright while the switch is off.
  if (!(await isFeatureEnabledForCurrentUser("launch_campaign"))) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign launches have been temporarily disabled by the administrator." };
  }
  const supabase = await createClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return { ok: false, sent: 0, failed: 0, skipped: 0, scheduled: 0, error: "Campaign not found" };
  return runCampaignSend(supabase, campaign, includeLeadIds);
}

/**
 * Fires any campaigns whose "Schedule for later" time has arrived. Runs off
 * the per-minute cron with the admin client — there's no user session to scope
 * RLS to at that point, so the lookup and send both need to bypass it.
 */
export async function processDueScheduledCampaigns(limit = 20): Promise<{ launched: number; failed: number }> {
  // No user session here — no admin to bypass for either. If the switch is
  // off, scheduled launches simply stay "Scheduled" and are picked up again
  // next tick once it's back on, rather than being silently dropped.
  if (!(await isFeatureEnabledForSystem("launch_campaign"))) return { launched: 0, failed: 0 };

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
