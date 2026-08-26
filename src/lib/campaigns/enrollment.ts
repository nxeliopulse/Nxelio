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
import { detectCampaignChannel } from "./channel";

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

  // Actively-enrolled leads move to "Nurturing" — they're now being worked by
  // a campaign. Skip Converted leads: enrollment shouldn't regress a closed lead.
  const activeLeadIds = rows.filter((r) => r.status === "active").map((r) => r.lead_id);
  if (activeLeadIds.length) {
    await supabase.from("leads").update({ status: "Nurturing" }).in("id", activeLeadIds).neq("status", "Converted");
  }

  revalidatePath("/campaigns");
  return { created: rows.length, skipped: leads.length - rows.length };
}

/** The actual leads enrolled in this campaign — the frozen launch-time snapshot,
 *  not a live re-resolve of the source segment. Falls back to null when the
 *  campaign hasn't launched yet (no enrollments exist), so the caller can show
 *  the live segment preview instead. */
export async function getEnrolledLeads<T = unknown>(campaignId: string): Promise<T[] | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_enrollments")
    .select("leads(*)")
    .eq("campaign_id", campaignId);
  if (!data || data.length === 0) return null;
  return data.map((row) => (row as unknown as { leads: T }).leads).filter(Boolean);
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

/** A booked meeting is a positive outcome, not a stop rule like a reply/
 *  unsubscribe — pauses (not exits) every active enrollment this lead has,
 *  across every campaign AND the generic outreach-sequence system, and
 *  cancels their pending jobs so no follow-up lands mid-conversation.
 *  "Paused" (not "exited") because it's reversible: if the meeting falls
 *  through, someone can manually resume it. */
export async function pauseCampaignEnrollmentsForMeeting(leadId: string): Promise<{ paused: number }> {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("campaign_enrollments")
    .select("id, campaign_id")
    .eq("lead_id", leadId)
    .in("status", ["active", "scheduled", "pending_review"]);

  if (enrollments?.length) {
    await supabase
      .from("campaign_enrollments")
      .update({ status: "paused", exit_reason: "Meeting booked" })
      .in("id", enrollments.map((e) => e.id));

    for (const e of enrollments) {
      await supabase
        .from("campaign_jobs")
        .update({ status: "canceled", last_error: "Meeting booked", updated_at: new Date().toISOString() })
        .eq("campaign_id", e.campaign_id)
        .eq("lead_id", leadId)
        .eq("status", "pending");
    }
  }

  // Same treatment for the older/generic outreach-sequence system (used by
  // src/lib/outreach/processor.ts) — a meeting should pause a lead's
  // sequence there too, not just email-campaign enrollments.
  const { data: seqEnrollments } = await supabase
    .from("outreach_enrollments")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "active");
  if (seqEnrollments?.length) {
    const ids = seqEnrollments.map((e) => e.id);
    await supabase.from("outreach_enrollments").update({ status: "paused", updated_at: new Date().toISOString() }).in("id", ids);
    await supabase
      .from("outreach_jobs")
      .update({ status: "canceled", last_error: "Meeting booked", updated_at: new Date().toISOString() })
      .in("enrollment_id", ids)
      .eq("status", "pending");
  }

  revalidatePath("/campaigns");
  return { paused: (enrollments?.length ?? 0) + (seqEnrollments?.length ?? 0) };
}

export async function advanceEnrollmentStep(campaignId: string, leadId: string, nextStep: number, nextExecutionAt: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ current_step: nextStep, next_execution_at: nextExecutionAt })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId);
}

/** Adds prospects to a campaign's audience (Phase 4 "Add prospects" drawer) —
 *  deliberate, explicit growth, distinct from the automatic-segment-refresh
 *  growth that's blocked elsewhere. If the campaign is segment-based and that
 *  segment is Dynamic, converts it to Static first: a Dynamic segment's
 *  membership gets silently overwritten by its rule on the next refresh,
 *  which would erase a manually-added member — Static segments don't have
 *  that hazard. Returns whether that conversion happened so the caller can
 *  toast it, and how many were actually new (vs. already enrolled). */
export async function addProspectsToCampaign(
  campaignId: string,
  segmentId: string | null,
  leads: EnrollableLead[]
): Promise<{ convertedSegmentToStatic: boolean; created: number; skipped: number; locked?: boolean }> {
  if (!leads.length) return { convertedSegmentToStatic: false, created: 0, skipped: 0 };
  const supabase = await createClient();

  // Authoritative server-side guard — the "Add prospects" button is disabled
  // client-side once a campaign has launched, but that alone can't be trusted
  // (a direct call could bypass it). A running campaign's audience is a
  // frozen snapshot, same principle as the Launch-button re-click guard.
  const { data: campaignRow } = await supabase.from("campaigns").select("status, content").eq("id", campaignId).single();
  if (campaignRow && campaignRow.status !== "Draft") {
    return { convertedSegmentToStatic: false, created: 0, skipped: leads.length, locked: true };
  }
  // Which contact field a lead must have depends on the campaign's actual
  // channel — a LinkedIn sequence needs a LinkedIn URL, not an email.
  const channel = detectCampaignChannel(campaignRow?.content ?? null);

  let convertedSegmentToStatic = false;

  if (segmentId) {
    const { data: segment } = await supabase.from("segments").select("segment_type").eq("id", segmentId).single();
    if (segment && segment.segment_type !== "Static") {
      await supabase.from("segments").update({ segment_type: "Static", rule_json: null }).eq("id", segmentId);
      convertedSegmentToStatic = true;
    }
    await supabase.from("segment_members").upsert(
      leads.map((l) => ({ segment_id: segmentId, lead_id: l.id })),
      { onConflict: "segment_id,lead_id" }
    );
  }

  const { created, skipped } = await createEnrollments(campaignId, segmentId, leads, { channel });
  revalidatePath("/campaigns");
  return { convertedSegmentToStatic, created, skipped };
}

export async function completeEnrollment(campaignId: string, leadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campaign_enrollments")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId);
}

/** Enrollment statuses that mean "still has work left to do" — the opposite of done. */
const IN_PROGRESS_STATUSES: EnrollmentStatus[] = ["pending_review", "scheduled", "active", "paused"];

/**
 * Call after any enrollment finishes (completeEnrollment, or a lead exiting/
 * failing/being suppressed mid-sequence) — if every enrollment for this
 * campaign is now done, flip the campaign itself to "Completed" instead of
 * leaving it stuck on "Active" forever. Only touches campaigns that are
 * still "Active" — never overrides a manually-set Paused/Draft/Completed
 * status, so this can't undo an admin's own choice.
 */
export async function checkAndCompleteCampaign(campaignId: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("campaign_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", IN_PROGRESS_STATUSES);
  if ((count ?? 0) > 0) return; // still work left — not done yet

  const { count: totalEnrollments } = await supabase
    .from("campaign_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (!totalEnrollments) return; // nothing was ever enrolled — nothing to complete

  await supabase
    .from("campaigns")
    .update({ status: "Completed" })
    .eq("id", campaignId)
    .eq("status", "Active"); // never overrides Paused/Draft or an already-Completed row
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}
