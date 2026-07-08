import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { substituteMergeTags } from "@/lib/email/merge-tags";
import { sendEmail as resendSendEmail } from "@/lib/email/resend";
import {
  unipileConfigured,
  unipileSendEmail,
  unipileSendInvite,
  unipileSendLinkedInMessage,
  unipileResolveProfile,
} from "@/lib/outreach/unipile";

// Plain admin-client types (service role bypasses RLS — we scope by workspace_id by hand).
type Db = ReturnType<typeof createAdminClient>;

interface JobRow {
  id: string;
  workspace_id: string;
  sequence_id: string;
  enrollment_id: string;
  lead_id: string;
  step_id: string | null;
  step_order: number;
  channel: "email" | "linkedin";
  action: string;
  account_id: string | null;
  subject: string | null;
  body: string | null;
}

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Drains due outreach jobs. Called by the cron route every minute.
 * For each due job: send it, log an activity, advance the enrollment by
 * scheduling the next step (delay_days later). Stops if the lead already replied.
 */
export async function processDueJobs(limit = 25): Promise<ProcessResult> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await db
    .from("outreach_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);

  const result: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  if (!jobs?.length) return result;

  for (const job of jobs as JobRow[]) {
    result.processed++;

    // Enrollment must still be active — replies/pauses cancel the rest.
    const { data: enrollment } = await db
      .from("outreach_enrollments")
      .select("status")
      .eq("id", job.enrollment_id)
      .single();
    if (!enrollment || enrollment.status !== "active") {
      await db.from("outreach_jobs").update({ status: "canceled", updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
      continue;
    }

    const { data: lead } = await db.from("leads").select("*").eq("id", job.lead_id).single();
    if (!lead) {
      await db.from("outreach_jobs").update({ status: "skipped", last_error: "Lead not found", updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
      continue;
    }

    const outcome = await executeJob(db, job, lead);
    await logActivity(db, job, outcome.status, outcome.detail);

    if (outcome.status === "sent") {
      await db.from("outreach_jobs").update({ status: "sent", updated_at: nowIso }).eq("id", job.id);
      await bumpCounter(db, job.sequence_id, "sent_count");
      result.sent++;
    } else if (outcome.status === "skipped") {
      // e.g. already connected/invited — not an error, just move on to the next step.
      await db.from("outreach_jobs").update({ status: "skipped", last_error: outcome.detail, updated_at: nowIso }).eq("id", job.id);
      result.skipped++;
    } else {
      await db.from("outreach_jobs").update({ status: "failed", last_error: outcome.detail, updated_at: nowIso }).eq("id", job.id);
      result.failed++;
    }
    // every outcome advances the sequence so one step never strands the lead
    await scheduleNextStep(db, job);
  }

  return result;
}

interface ExecOutcome { status: "sent" | "failed" | "skipped"; detail: string }

async function executeJob(db: Db, job: JobRow, lead: Record<string, unknown>): Promise<ExecOutcome> {
  const mergeLead = {
    full_name: (lead.full_name as string) ?? null,
    company_name: (lead.company_name as string) ?? null,
    industry: (lead.industry as string) ?? null,
    email: (lead.email as string) ?? null,
    interest_area: (lead.interest_area as string) ?? null,
  };
  const subject = substituteMergeTags(job.subject || "", mergeLead);
  const body = substituteMergeTags(job.body || "", mergeLead);

  // Resolve the sending account (the job's, or the first connected one for the channel).
  const account = await resolveAccount(db, job);

  if (job.channel === "email") {
    const to = mergeLead.email;
    if (!to) return { status: "failed", detail: "Lead has no email address" };
    if (await isBlockedInWorkspace(db, job.workspace_id, to)) return { status: "failed", detail: "Recipient is on the blocklist" };

    // Prefer a connected Unipile mailbox; fall back to Resend so email works pre-Unipile.
    if (unipileConfigured && account) {
      try {
        await unipileSendEmail({ accountId: account.account_id, to, subject, body });
        return { status: "sent", detail: `Email via ${account.identifier || account.name || "mailbox"} → ${to}: ${subject}` };
      } catch (err) {
        return { status: "failed", detail: err instanceof Error ? err.message : "Unipile email failed" };
      }
    }
    const r = await resendSendEmail({ to, subject, text: body });
    if (!r.ok) return { status: "failed", detail: r.error || "Resend send failed" };
    return { status: "sent", detail: `Email via Resend → ${to}${r.redirectedTo ? ` (sandbox→${r.redirectedTo})` : ""}: ${subject}` };
  }

  // LinkedIn
  if (!unipileConfigured) return { status: "failed", detail: "LinkedIn requires Unipile — not configured" };
  if (!account) return { status: "failed", detail: "No connected LinkedIn account" };
  const linkedinUrl = (lead.linkedin as string) || "";
  if (!linkedinUrl && job.action !== "profile_view") return { status: "failed", detail: "Lead has no LinkedIn URL" };

  const { providerId } = await unipileResolveProfile({ accountId: account.account_id, identifier: linkedinUrl });
  if (!providerId) return { status: "failed", detail: "Could not resolve LinkedIn profile" };

  try {
    if (job.action === "connection_request") {
      await unipileSendInvite({ accountId: account.account_id, providerId, message: body });
      return { status: "sent", detail: `LinkedIn invite → ${linkedinUrl}` };
    }
    if (job.action === "linkedin_message") {
      await unipileSendLinkedInMessage({ accountId: account.account_id, providerId, text: body });
      return { status: "sent", detail: `LinkedIn message → ${linkedinUrl}` };
    }
    // profile_view — resolving the profile already counts as a visit
    return { status: "sent", detail: `LinkedIn profile view → ${linkedinUrl}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LinkedIn action failed";
    // Already connected / invite already pending → not a failure. Skip the
    // connection request and let the sequence advance to the message step.
    if (job.action === "connection_request" && /already|invitation has already|cannot be sent/i.test(msg)) {
      return { status: "skipped", detail: `Already connected/invited — skipped to next step (${linkedinUrl})` };
    }
    return { status: "failed", detail: msg };
  }
}

async function resolveAccount(db: Db, job: JobRow): Promise<{ account_id: string; name: string | null; identifier: string | null } | null> {
  if (job.account_id) {
    const { data } = await db.from("outreach_accounts").select("account_id, name, identifier").eq("id", job.account_id).single();
    if (data) return data;
  }
  const { data } = await db
    .from("outreach_accounts")
    .select("account_id, name, identifier")
    .eq("workspace_id", job.workspace_id)
    .eq("channel", job.channel)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function isBlockedInWorkspace(db: Db, workspaceId: string, email: string): Promise<boolean> {
  const domain = email.split("@")[1] || "";
  const { data } = await db
    .from("blocklist")
    .select("value")
    .eq("workspace_id", workspaceId);
  if (!data) return false;
  const lower = email.toLowerCase();
  return data.some((b: { value: string }) => {
    const v = (b.value || "").toLowerCase();
    return v === lower || v === `@${domain}` || v === domain;
  });
}

/** Schedules the next step in the sequence for this lead, or completes the enrollment. */
async function scheduleNextStep(db: Db, job: JobRow) {
  const nowMs = Date.now();
  const { data: steps } = await db
    .from("outreach_steps")
    .select("*")
    .eq("sequence_id", job.sequence_id)
    .order("step_order", { ascending: true });

  const next = (steps ?? []).find((s: { step_order: number }) => s.step_order === job.step_order + 1) as
    | { id: string; step_order: number; channel: "email" | "linkedin"; action: string; delay_days: number; delay_unit: string; subject: string | null; body: string | null }
    | undefined;

  if (!next) {
    await db.from("outreach_enrollments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.enrollment_id);
    return;
  }

  // delay_days holds the VALUE; delay_unit (minutes|hours|days) says the unit.
  const unitMs: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
  const ms = (next.delay_days || 0) * (unitMs[next.delay_unit] ?? unitMs.days);
  const runAt = new Date(nowMs + ms).toISOString();
  await db.from("outreach_jobs").insert({
    workspace_id: job.workspace_id,
    sequence_id: job.sequence_id,
    enrollment_id: job.enrollment_id,
    lead_id: job.lead_id,
    step_id: next.id,
    step_order: next.step_order,
    channel: next.channel,
    action: next.action,
    account_id: null,
    subject: next.subject,
    body: next.body,
    run_at: runAt,
    status: "pending",
  });
  await db.from("outreach_enrollments").update({ current_step: next.step_order, updated_at: new Date().toISOString() }).eq("id", job.enrollment_id);
}

async function logActivity(db: Db, job: JobRow, status: string, detail: string) {
  await db.from("outreach_activities").insert({
    workspace_id: job.workspace_id,
    sequence_id: job.sequence_id,
    step_id: job.step_id,
    lead_id: job.lead_id,
    channel: job.channel,
    action: job.action,
    status,
    detail,
  });
}

async function bumpCounter(db: Db, sequenceId: string, column: "sent_count" | "reply_count") {
  const { data } = await db.from("outreach_sequences").select(column).eq("id", sequenceId).single();
  const current = (data as Record<string, number> | null)?.[column] ?? 0;
  await db.from("outreach_sequences").update({ [column]: current + 1 }).eq("id", sequenceId);
}
