"use server";

// ---------------------------------------------------------------------------
// Campaign Enrollment Service (Phase 4C) — one enrollment record per
// (campaign, lead). Never copies prospect data — enrollments reference
// lead_id and campaigns join to `leads` for display. This is the single
// place enrollment rows are created/mutated; campaign-send.ts and
// campaign-scheduler.ts call into this instead of touching the table directly.
// ---------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkLeadEligibility, type CampaignEligibilityRules, type EligibilityLead } from "./eligibility-core";
import { isSuppressed } from "@/lib/segments";

/** Minimal shape needed to create an enrollment — works with LeadRow or StepLead. */
type EnrollableLead = EligibilityLead & { id: string };

export type EnrollmentStatus =
  | "pending_review" | "scheduled" | "active" | "paused"
  | "completed" | "exited" | "suppressed" | "failed" | "cancelled";

export interface CampaignEnrollmentRow {
  id: string;
  campaign_id: string;
  audience_id: string | null;
  lead_id: string;
  status: EnrollmentStatus;
  current_step: number;
  next_execution_at: string | null;
  entered_at: string;
  completed_at: string | null;
  exit_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Creates one enrollment per eligible lead, skipping leads already enrolled
 *  in this campaign (unique constraint backs this up too). Ineligible leads
 *  (suppressed or failing the basic per-lead check) are enrolled with status
 *  "suppressed"/"failed" instead of silently dropped, so they're visible in
 *  the Enrollment Monitor with a real reason rather than just missing. */
export async function createEnrollments(
  campaignId: string,
  audienceId: string | null,
  leads: EnrollableLead[],
  rules: CampaignEligibilityRules = {}
): Promise<{ created: number; skipped: number }> {
  if (!leads.length) return { created: 0, skipped: 0 };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("campaign_enrollments")
    .select("lead_id")
    .eq("campaign_id", campaignId);
  const already = new Set((existing || []).map((e) => e.lead_id));

  const rows = leads
    .filter((l) => !already.has(l.id))
    .map((lead) => {
      const suppressed = isSuppressed(lead);
      const check = checkLeadEligibility(lead, rules);
      const status: EnrollmentStatus = suppressed ? "suppressed" : check.eligible ? "active" : "failed";
      return {
        campaign_id: campaignId,
        audience_id: audienceId,
        lead_id: lead.id,
        status,
        current_step: 0,
        exit_reason: !check.eligible && !suppressed ? check.reasons.join(", ") : suppressed ? "suppressed" : null,
      };
    });

  if (!rows.length) return { created: 0, skipped: leads.length };
  const { error } = await supabase.from("campaign_enrollments").insert(rows);
  if (error) { console.error("createEnrollments error:", error); return { created: 0, skipped: leads.length }; }

  revalidatePath("/campaigns");
  return { created: rows.length, skipped: leads.length - rows.length };
}

export async function getEnrollments(campaignId: string): Promise<CampaignEnrollmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_enrollments")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("entered_at", { ascending: false });
  return (data as CampaignEnrollmentRow[]) || [];
}

export async function getEnrollmentCounts(campaignId: string): Promise<Record<EnrollmentStatus, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_enrollments")
    .select("status")
    .eq("campaign_id", campaignId);
  const counts: Record<EnrollmentStatus, number> = {
    pending_review: 0, scheduled: 0, active: 0, paused: 0,
    completed: 0, exited: 0, suppressed: 0, failed: 0, cancelled: 0,
  };
  for (const row of data || []) {
    const s = row.status as EnrollmentStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}

/** Stop Rules (Phase 4E) — moves an enrollment to EXITED with a structured
 *  reason and cancels its own future scheduled step. Campaign-scheduler.ts
 *  calls this whenever it detects a reply/unsubscribe/bounce/manual removal,
 *  instead of only cancelling the job row (previous behavior). */
export async function exitEnrollment(enrollmentId: string, reason: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ status: "exited", exit_reason: reason, completed_at: new Date().toISOString() })
    .eq("id", enrollmentId);
}

export async function exitEnrollmentByLead(campaignId: string, leadId: string, reason: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ status: "exited", exit_reason: reason, completed_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .in("status", ["active", "scheduled", "paused", "pending_review"]);
}

export async function advanceEnrollmentStep(campaignId: string, leadId: string, nextStep: number, nextExecutionAt: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ current_step: nextStep, next_execution_at: nextExecutionAt })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId);
}

export async function completeEnrollment(campaignId: string, leadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId);
}
