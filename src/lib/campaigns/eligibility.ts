"use server";

// ---------------------------------------------------------------------------
// Eligibility Service (Phase 4B) — the single place that decides whether a
// lead may be enrolled/sent to for a campaign. Reuses isSuppressed() from the
// Audience Engine rather than re-implementing suppression logic; never
// duplicated inline in campaign-send.ts / campaign-scheduler.ts again.
// ---------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import { isSuppressed } from "@/lib/segments";
import type { LeadRow } from "@/lib/queries/leads";
import { checkLeadEligibility, type CampaignEligibilityRules, type EligibilityResult } from "./eligibility-core";

export type { IneligibleReason, EligibilityResult, CampaignEligibilityRules } from "./eligibility-core";

/** DB-backed check for one lead against one campaign — adds enrollment-conflict checks
 *  on top of the pure per-lead check above. Used right before every send/step. */
export async function checkCampaignEligibility(
  campaignId: string,
  lead: LeadRow,
  rules: CampaignEligibilityRules = {}
): Promise<EligibilityResult> {
  const base = checkLeadEligibility(lead, rules);
  const reasons = [...base.reasons];

  const supabase = await createClient();
  const maxActive = rules.maxActivePerLead ?? 1;
  const minDays = rules.minDaysBetweenCampaigns ?? 0;

  const { data: activeElsewhere } = await supabase
    .from("campaign_enrollments")
    .select("id, campaign_id, status, entered_at")
    .eq("lead_id", lead.id)
    .in("status", ["active", "scheduled", "pending_review"]);

  const activeThisCampaign = (activeElsewhere || []).some((e) => e.campaign_id === campaignId);
  if (activeThisCampaign) reasons.push("already_active_this_campaign");

  const activeOtherCampaigns = (activeElsewhere || []).filter((e) => e.campaign_id !== campaignId);
  if (activeOtherCampaigns.length >= maxActive) reasons.push("already_active_conflicting_campaign");

  if (minDays > 0) {
    const cutoff = new Date(Date.now() - minDays * 86_400_000).toISOString();
    const { data: recent } = await supabase
      .from("campaign_enrollments")
      .select("id")
      .eq("lead_id", lead.id)
      .neq("campaign_id", campaignId)
      .gte("entered_at", cutoff)
      .limit(1);
    if (recent?.length) reasons.push("recently_campaigned");
  }

  return { eligible: reasons.length === 0, reasons };
}

export interface AudienceEligibilitySummary {
  matched: number;
  suppressed: number;
  alreadyActive: number;
  eligible: number;
}

/** Classifies a candidate audience (Matched → Suppressed → Already Active → Eligible) —
 *  the exact breakdown the campaign wizard's "Select Audience" step displays. */
export async function summarizeAudienceEligibility(
  campaignId: string | null,
  leads: LeadRow[],
  rules: CampaignEligibilityRules = {}
): Promise<AudienceEligibilitySummary> {
  const matched = leads.length;
  if (matched === 0) return { matched: 0, suppressed: 0, alreadyActive: 0, eligible: 0 };

  const supabase = await createClient();
  const leadIds = leads.map((l) => l.id);

  const activeMap = new Set<string>();
  if (campaignId) {
    const { data: active } = await supabase
      .from("campaign_enrollments")
      .select("lead_id")
      .in("lead_id", leadIds)
      .in("status", ["active", "scheduled", "pending_review"]);
    for (const row of active || []) activeMap.add(row.lead_id);
  }

  let suppressed = 0;
  let alreadyActive = 0;
  let eligible = 0;
  for (const lead of leads) {
    if (isSuppressed(lead)) { suppressed++; continue; }
    if (activeMap.has(lead.id)) { alreadyActive++; continue; }
    const check = checkLeadEligibility(lead, rules);
    if (check.eligible) eligible++;
  }

  return { matched, suppressed, alreadyActive, eligible };
}
