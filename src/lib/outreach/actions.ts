"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { aiJson, aiConfigured } from "@/lib/ai/client";
import {
  getSequenceById,
  getSequenceSteps,
  type StepChannel,
  type StepAction,
} from "@/lib/queries/outreach";
import { processDueJobs } from "@/lib/outreach/processor";

export interface EnrollResult {
  ok: boolean;
  enrolled: number;
  skipped: number;
  sent: number;
  failed: number;
  error?: string;
}

/**
 * Enrolls leads into a sequence. For each lead we create the enrollment and a
 * job for step 1 due now; the processor (run inline here for instant feedback,
 * and by the cron route every minute) sends it and schedules each next step at
 * its delay. Replies cancel the remaining jobs (see the Unipile webhook).
 */
export async function enrollLeads(sequenceId: string, leadIds: string[]): Promise<EnrollResult> {
  if (!leadIds.length) return { ok: false, enrolled: 0, skipped: 0, sent: 0, failed: 0, error: "No leads selected" };

  const sequence = await getSequenceById(sequenceId);
  if (!sequence) return { ok: false, enrolled: 0, skipped: 0, sent: 0, failed: 0, error: "Sequence not found" };

  const steps = await getSequenceSteps(sequenceId);
  if (!steps.length) return { ok: false, enrolled: 0, skipped: 0, sent: 0, failed: 0, error: "Add at least one step before enrolling leads" };

  const supabase = await createClient();
  const firstStep = steps[0];
  const createdJobIds: string[] = [];
  let enrolled = 0;
  let skipped = 0;

  for (const leadId of leadIds) {
    const { data: enrollment, error: enrollErr } = await supabase
      .from("outreach_enrollments")
      .insert({ sequence_id: sequenceId, lead_id: leadId, status: "active", current_step: 1 })
      .select("id")
      .single();
    if (enrollErr || !enrollment) {
      skipped++; // unique violation = already enrolled
      continue;
    }
    enrolled++;

    const { data: job } = await supabase
      .from("outreach_jobs")
      .insert({
        sequence_id: sequenceId,
        enrollment_id: enrollment.id,
        lead_id: leadId,
        step_id: firstStep.id,
        step_order: firstStep.step_order,
        channel: firstStep.channel,
        action: firstStep.action,
        subject: firstStep.subject,
        body: firstStep.body,
        run_at: new Date().toISOString(),
        status: "pending",
      })
      .select("id")
      .single();
    if (job) createdJobIds.push(job.id);
  }

  if (enrolled > 0) {
    await supabase
      .from("outreach_sequences")
      .update({
        enrolled_count: (sequence.enrolled_count || 0) + enrolled,
        status: sequence.status === "Draft" ? "Active" : sequence.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sequenceId);
  }

  // Fire the now-due first steps immediately so the user sees results.
  let sent = 0;
  let failed = 0;
  if (createdJobIds.length) {
    await processDueJobs(Math.max(25, createdJobIds.length));
    const { data: jobRows } = await supabase
      .from("outreach_jobs")
      .select("status")
      .in("id", createdJobIds);
    for (const j of jobRows ?? []) {
      if (j.status === "sent") sent++;
      else if (j.status === "failed") failed++;
    }
  }

  if (enrolled > 0) {
    await notifyCurrentUser({
      type: "email",
      title: `${enrolled} lead${enrolled === 1 ? "" : "s"} enrolled in "${sequence.name}"`,
      message: `${sent} first step${sent === 1 ? "" : "s"} sent now; follow-ups will send on schedule.`,
      link: `/outreach/builder?id=${sequenceId}`,
    });
  }

  revalidatePath("/outreach");
  return { ok: true, enrolled, skipped, sent, failed };
}

// ---------------------------------------------------------------------------
// AI — generate a multi-channel sequence from a plain-English goal
// ---------------------------------------------------------------------------
export interface GeneratedOutreachStep {
  channel: StepChannel;
  action: StepAction;
  delay_days: number;
  subject?: string;
  body: string;
}

export async function isOutreachAiConfigured() {
  return aiConfigured;
}

/**
 * Manually drains due jobs — the same work the cron route does, but callable
 * from the UI. Useful on localhost (where Supabase pg_cron can't reach the app)
 * to fire due follow-up steps on demand for testing.
 */
export async function runOutreachProcessorNow() {
  const result = await processDueJobs(100);
  revalidatePath("/outreach");
  return result;
}

export async function generateOutreachSequence(goal: string, audience?: string): Promise<GeneratedOutreachStep[]> {
  const system = `You are an expert B2B sales copywriter who designs multi-channel outreach sequences mixing LinkedIn and email. Use merge tags like {{firstName}}, {{companyName}}, {{industry}} where personalization helps. Keep LinkedIn messages under 60 words and emails under 120 words. Return ONLY valid JSON.`;

  const prompt = `Design a 5-step multi-channel outreach sequence for this goal: "${goal}"${audience ? `\nTarget audience: ${audience}` : ""}

Mix LinkedIn and email steps naturally (e.g. connection request first, then messages and emails as follow-ups). Use increasing delays.

Return JSON in exactly this shape:
{
  "steps": [
    { "channel": "linkedin", "action": "connection_request", "delay_days": 0, "body": "..." },
    { "channel": "linkedin", "action": "linkedin_message", "delay_days": 2, "body": "..." },
    { "channel": "email", "action": "email", "delay_days": 4, "subject": "...", "body": "..." }
  ]
}
Allowed channel/action pairs: linkedin+connection_request, linkedin+linkedin_message, linkedin+profile_view, email+email.`;

  const result = await aiJson<{ steps: GeneratedOutreachStep[] }>({ system, prompt, temperature: 0.8 });
  return (result.steps || []).map((s) => ({
    channel: s.channel === "linkedin" ? "linkedin" : "email",
    action: s.action,
    delay_days: Number(s.delay_days) || 0,
    subject: s.subject,
    body: s.body || "",
  }));
}
