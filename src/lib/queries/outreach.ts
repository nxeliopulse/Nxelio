"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// 'email' steps send mail; 'linkedin' steps perform a LinkedIn action.
export type OutreachChannel = "email" | "linkedin" | "multichannel";
export type StepChannel = "email" | "linkedin";
export type StepAction = "email" | "connection_request" | "linkedin_message" | "profile_view";
export type DelayUnit = "minutes" | "hours" | "days";

export interface OutreachSequenceRow {
  id: string;
  name: string;
  description: string | null;
  channel: OutreachChannel;
  status: string;
  enrolled_count: number;
  sent_count: number;
  reply_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachStepRow {
  id: string;
  sequence_id: string;
  step_order: number;
  channel: StepChannel;
  action: StepAction;
  delay_days: number;       // delay VALUE (paired with delay_unit)
  delay_unit: DelayUnit;
  subject: string | null;
  body: string | null;
  created_at: string;
}

export interface OutreachStepInput {
  channel: StepChannel;
  action: StepAction;
  delay_days: number;       // delay VALUE (paired with delay_unit)
  delay_unit?: DelayUnit;
  subject?: string | null;
  body?: string | null;
}

export interface OutreachActivityRow {
  id: string;
  sequence_id: string;
  step_id: string | null;
  lead_id: string | null;
  channel: string;
  action: string;
  status: string;
  detail: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------
export async function getSequences(): Promise<OutreachSequenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_sequences")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("getSequences error:", error);
    return [];
  }
  return data ?? [];
}

export async function getSequenceStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_sequences")
    .select("status, enrolled_count, sent_count, reply_count");
  if (!data) return { active: 0, enrolled: 0, sent: 0, replyRate: 0 };
  const active = data.filter((s) => s.status === "Active").length;
  const enrolled = data.reduce((n, s) => n + (s.enrolled_count || 0), 0);
  const sent = data.reduce((n, s) => n + (s.sent_count || 0), 0);
  const replies = data.reduce((n, s) => n + (s.reply_count || 0), 0);
  const replyRate = sent ? Math.round((replies / sent) * 1000) / 10 : 0;
  return { active, enrolled, sent, replyRate };
}

export async function getSequenceById(id: string): Promise<OutreachSequenceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("outreach_sequences").select("*").eq("id", id).single();
  return data;
}

export async function getSequenceSteps(sequenceId: string): Promise<OutreachStepRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });
  return data ?? [];
}

export async function createSequence(payload: Partial<OutreachSequenceRow>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("outreach_sequences")
    .insert({
      name: payload.name || "Untitled Sequence",
      channel: payload.channel || "multichannel",
      status: payload.status || "Draft",
      description: payload.description ?? null,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/outreach");
  return data as OutreachSequenceRow;
}

export async function updateSequence(id: string, payload: Partial<OutreachSequenceRow>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("outreach_sequences")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/outreach");
}

export async function setSequenceStatus(id: string, status: string) {
  return updateSequence(id, { status });
}

export async function deleteSequence(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_sequences").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/outreach");
}

/** Replace all steps for a sequence with the given ordered list. */
export async function saveSequenceSteps(sequenceId: string, steps: OutreachStepInput[]) {
  const supabase = await createClient();
  // wipe existing, then re-insert in order
  const { error: delErr } = await supabase.from("outreach_steps").delete().eq("sequence_id", sequenceId);
  if (delErr) throw delErr;
  if (steps.length) {
    const rows = steps.map((s, i) => ({
      sequence_id: sequenceId,
      step_order: i + 1,
      channel: s.channel,
      action: s.action,
      delay_days: s.delay_days ?? 0,
      delay_unit: s.delay_unit ?? "days",
      subject: s.subject ?? null,
      body: s.body ?? null,
    }));
    const { error: insErr } = await supabase.from("outreach_steps").insert(rows);
    if (insErr) throw insErr;
  }
  // keep the channel summary on the parent in sync
  const channels = new Set(steps.map((s) => s.channel));
  const channel: OutreachChannel =
    channels.size > 1 ? "multichannel" : channels.has("linkedin") ? "linkedin" : "email";
  await updateSequence(sequenceId, { channel });
  revalidatePath("/outreach");
}

export async function duplicateSequence(id: string) {
  const supabase = await createClient();
  const existing = await getSequenceById(id);
  if (!existing) throw new Error("Sequence not found");
  const steps = await getSequenceSteps(id);

  const copy = await createSequence({
    name: `${existing.name} (copy)`,
    channel: existing.channel,
    description: existing.description,
    status: "Draft",
  });
  if (steps.length) {
    await supabase.from("outreach_steps").insert(
      steps.map((s) => ({
        sequence_id: copy.id,
        step_order: s.step_order,
        channel: s.channel,
        action: s.action,
        delay_days: s.delay_days,
        delay_unit: s.delay_unit,
        subject: s.subject,
        body: s.body,
      }))
    );
  }
  revalidatePath("/outreach");
  return copy;
}

// ---------------------------------------------------------------------------
// Activity feed (per sequence)
// ---------------------------------------------------------------------------
export async function getSequenceActivities(sequenceId: string): Promise<OutreachActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_activities")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export interface OutreachActivityFeedRow {
  id: string;
  lead_name: string;
  channel: string;
  action: string;
  status: string;
  detail: string | null;
  created_at: string;
}

/** Per-lead activity feed for one sequence (what was sent/failed/replied, to whom). */
export async function getSequenceActivityFeed(sequenceId: string): Promise<OutreachActivityFeedRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_activities")
    .select("id, channel, action, status, detail, created_at, lead:leads(full_name, company_name, email)")
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; channel: string; action: string; status: string; detail: string | null; created_at: string;
      lead: { full_name: string | null; company_name: string | null; email: string | null } | null;
    };
    return {
      id: row.id,
      channel: row.channel,
      action: row.action,
      status: row.status,
      detail: row.detail,
      created_at: row.created_at,
      lead_name: row.lead?.full_name || row.lead?.company_name || row.lead?.email || "Lead",
    };
  });
}

export async function getEnrolledLeadIds(sequenceId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_enrollments")
    .select("lead_id")
    .eq("sequence_id", sequenceId);
  return (data ?? []).map((r) => r.lead_id);
}
