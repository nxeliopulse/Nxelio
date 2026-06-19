import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { substituteMergeTags } from "@/lib/email/merge-tags";
import { parseDelay, delayToMinutes } from "@/lib/sequence-delay";

// Loosely-typed client — both the authenticated and admin clients expose the same query API.
type Db = SupabaseClient;

export interface CampaignStep {
  /** Minutes after launch this step should send (Step 1 is 0). */
  delayMin: number;
  subject: string;
  body: string;
}

export interface StepLead {
  id: string;
  full_name: string | null;
  company_name: string | null;
  industry: string | null;
  email: string | null;
  interest_area: string | null;
}

/** Parse a campaign's stored content into ordered steps with their delays. */
export function parseCampaignSteps(content: string | null, fallbackSubject: string | null): CampaignStep[] {
  if (!content || !content.trim()) {
    return [{ delayMin: 0, subject: fallbackSubject || "Hello", body: content || "" }];
  }
  const blocks = content.split(/\n+\s*---\s*\n+/);
  const steps: CampaignStep[] = [];
  blocks.forEach((block, i) => {
    const lines = block.trim().split("\n");
    const header = lines[0] || "";
    const m = header.match(/^(.*?)\s+—\s+(.*)$/); // "Day 3 — Subject"
    const delayLabel = m ? m[1] : i === 0 ? "Day 1" : "No delay";
    const subject = (m ? m[2] : header) || fallbackSubject || "Hello";
    const body = lines.slice(1).join("\n").trim() || block.trim();
    const d = parseDelay(delayLabel);
    steps.push({ delayMin: delayToMinutes(d.value, d.unit), subject, body });
  });
  return steps.length ? steps : [{ delayMin: 0, subject: fallbackSubject || "Hello", body: content }];
}

async function isBlockedIn(db: Db, workspaceId: string, email: string): Promise<boolean> {
  const domain = email.split("@")[1] || "";
  const { data } = await db.from("blocklist").select("value").eq("workspace_id", workspaceId);
  const lower = email.toLowerCase();
  return (data || []).some((b: { value: string }) => {
    const v = (b.value || "").toLowerCase();
    return v === lower || v === `@${domain}` || v === domain;
  });
}

export interface StepSendResult { ok: boolean; simulated?: boolean; skipped?: boolean; error?: string }

/**
 * Sends one campaign step to one lead, with the campaign's Brevo tag (for open
 * tracking attribution) and inbox + activity logging. Used for both the
 * immediate Step 1 (authenticated client) and scheduled follow-ups (admin
 * client) — workspace_id is always set explicitly so it works in both paths.
 */
export async function sendCampaignStepToLead(
  db: Db,
  opts: { campaignId: string; workspaceId: string; lead: StepLead; subject: string; body: string; senderName?: string }
): Promise<StepSendResult> {
  const { campaignId, workspaceId, lead, senderName } = opts;
  if (!lead.email) return { ok: false, skipped: true, error: "No email" };
  if (await isBlockedIn(db, workspaceId, lead.email)) return { ok: false, skipped: true, error: "Blocklisted" };

  const subject = substituteMergeTags(opts.subject, lead, senderName);
  const body = substituteMergeTags(opts.body, lead, senderName);

  const r = await sendEmail({ to: lead.email, subject, text: body, tags: [campaignId] });
  if (!r.ok) return { ok: false, error: r.error };

  await db.from("inbox_messages").insert({
    lead_id: lead.id, campaign_id: campaignId, workspace_id: workspaceId,
    direction: "outbound", subject, body, is_read: true,
  });
  await db.from("lead_activities").insert({
    lead_id: lead.id, workspace_id: workspaceId,
    activity_type: "EMAIL_SENT", metadata: { campaign_id: campaignId },
  });
  return { ok: true, simulated: r.simulated };
}

/** Queue the follow-up steps (2..N) for one lead at launch + each step's delay. */
export async function scheduleCampaignFollowups(
  db: Db,
  opts: { campaignId: string; workspaceId: string; leadId: string; steps: CampaignStep[]; launchMs: number }
): Promise<void> {
  const followups = opts.steps.slice(1);
  if (!followups.length) return;
  const rows = followups.map((s, idx) => ({
    campaign_id: opts.campaignId,
    workspace_id: opts.workspaceId,
    lead_id: opts.leadId,
    step_order: idx + 2, // step 2, 3, ...
    subject: s.subject,
    body: s.body,
    run_at: new Date(opts.launchMs + Math.max(0, s.delayMin) * 60_000).toISOString(),
    status: "pending",
  }));
  await db.from("campaign_jobs").insert(rows);
}

export interface CampaignProcessResult { processed: number; sent: number; failed: number; skipped: number }

/**
 * Drains due campaign follow-up jobs. Called by the per-minute cron alongside
 * the outreach processor. Sends each due step, stops a lead's remaining steps
 * once they reply, and pauses (leaves pending) if the campaign isn't Active.
 */
export async function processDueCampaignJobs(limit = 50): Promise<CampaignProcessResult> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const result: CampaignProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const { data: jobs } = await db
    .from("campaign_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);
  if (!jobs?.length) return result;

  for (const job of jobs as Record<string, string>[]) {
    result.processed++;

    const { data: campaign } = await db
      .from("campaigns")
      .select("id, status, sent_count, workspace_id")
      .eq("id", job.campaign_id)
      .single();

    // Campaign gone → cancel. Paused → leave pending so it resumes later.
    if (!campaign) {
      await db.from("campaign_jobs").update({ status: "canceled", last_error: "Campaign deleted", updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
      continue;
    }
    if (campaign.status !== "Active") { result.skipped++; continue; }

    // Reply-stop: if the lead has replied to this campaign, cancel their remaining steps.
    const { count: replyCount } = await db
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", job.campaign_id)
      .eq("lead_id", job.lead_id)
      .eq("direction", "inbound");
    if ((replyCount || 0) > 0) {
      await db.from("campaign_jobs").update({ status: "canceled", last_error: "Lead replied", updated_at: nowIso })
        .eq("campaign_id", job.campaign_id).eq("lead_id", job.lead_id).eq("status", "pending");
      result.skipped++;
      continue;
    }

    const { data: lead } = await db
      .from("leads")
      .select("id, full_name, company_name, industry, email, interest_area")
      .eq("id", job.lead_id)
      .single();
    if (!lead) {
      await db.from("campaign_jobs").update({ status: "skipped", last_error: "Lead not found", updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
      continue;
    }

    const r = await sendCampaignStepToLead(db, {
      campaignId: job.campaign_id,
      workspaceId: (campaign.workspace_id as string) || (job.workspace_id as string),
      lead: lead as StepLead,
      subject: job.subject || "",
      body: job.body || "",
    });

    if (r.ok) {
      await db.from("campaign_jobs").update({ status: "sent", updated_at: nowIso }).eq("id", job.id);
      await db.from("campaigns").update({ sent_count: (campaign.sent_count || 0) + 1 }).eq("id", job.campaign_id);
      result.sent++;
    } else if (r.skipped) {
      await db.from("campaign_jobs").update({ status: "skipped", last_error: r.error, updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
    } else {
      await db.from("campaign_jobs").update({ status: "failed", last_error: r.error, attempts: (Number(job.attempts) || 0) + 1, updated_at: nowIso }).eq("id", job.id);
      result.failed++;
    }
  }

  return result;
}
