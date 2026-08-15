// Shared opportunity constants + types. Kept out of the "use server" query
// module because a "use server" file may only export async functions.
import type { SupabaseClient } from "@supabase/supabase-js";

export const OPPORTUNITY_STAGES = [
  "new",
  "qualified",
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  new: "New",
  qualified: "Qualified",
  meeting_scheduled: "Meeting Scheduled",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const CLOSED_STAGES: OpportunityStage[] = ["won", "lost"];

export interface OpportunityRow {
  id: string;
  lead_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  owner_id: string | null;
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  deal_value: number;
  stage: OpportunityStage;
  expected_close_date: string | null;
  notes: string | null;
  closed_at: string | null;
  pipeline: string | null;
  currency: string | null;
  period: string | null;
  period_value: number | null;
  due_date: string | null;
  follow_up_date: string | null;
  source: string | null;
  tags: string | null;
  priority: "Low" | "Medium" | "High" | null;
  projects: string | null;
  /** Denormalized at conversion time (see resolveLeadAttribution below) so
   *  Campaign/Segment → Revenue analytics survive the lead being deleted. */
  campaign_id: string | null;
  segment_id: string | null;
  /** Nullable — not yet captured by any UI action (see migration 0122). */
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Deterministic win-probability/forecast-category lookup, keyed on stage.
// Written as a fixed table today; call sites pass just `stage` so this can
// later read from pipeline metadata (per-stage probability config) instead
// of a hardcoded switch, without changing anything that calls it.
export interface StageForecast {
  probability: number;
  forecastCategory: string;
}

const STAGE_FORECAST: Record<OpportunityStage, StageForecast> = {
  new: { probability: 10, forecastCategory: "Pipeline" },
  qualified: { probability: 25, forecastCategory: "Pipeline" },
  meeting_scheduled: { probability: 50, forecastCategory: "Best Case" },
  proposal_sent: { probability: 65, forecastCategory: "Best Case" },
  negotiation: { probability: 80, forecastCategory: "Commit" },
  won: { probability: 100, forecastCategory: "Closed" },
  lost: { probability: 0, forecastCategory: "Closed" },
};

export function getStageForecast(stage: OpportunityStage): StageForecast {
  return STAGE_FORECAST[stage];
}

/**
 * Resolves the campaign/segment a lead should be attributed to at the
 * moment it's converted into an Opportunity. Checked in order:
 *   1. Its most recent campaign_enrollments row (has both campaign_id and
 *      audience_id/segment_id in one place — the real source of truth for
 *      campaign-driven outreach).
 *   2. Falls back to the most recent EMAIL_SENT lead_activities row's
 *      metadata.campaign_id (older/ad-hoc sends predate per-lead
 *      enrollment rows) for the campaign, and the most recently-added
 *      segment_members row for the segment.
 * Called once at conversion time and stored on the opportunity row itself,
 * since opportunities.lead_id is ON DELETE SET NULL and would otherwise
 * silently lose this attribution if the lead is later deleted.
 */
export async function resolveLeadAttribution(
  supabase: SupabaseClient,
  leadId: string
): Promise<{ campaignId: string | null; segmentId: string | null }> {
  const { data: enrollment } = await supabase
    .from("campaign_enrollments")
    .select("campaign_id, audience_id")
    .eq("lead_id", leadId)
    .order("entered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (enrollment) {
    return {
      campaignId: (enrollment as { campaign_id: string | null }).campaign_id ?? null,
      segmentId: (enrollment as { audience_id: string | null }).audience_id ?? null,
    };
  }

  const { data: activity } = await supabase
    .from("lead_activities")
    .select("metadata")
    .eq("lead_id", leadId)
    .eq("activity_type", "EMAIL_SENT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const campaignId = (activity as { metadata: { campaign_id?: string } | null } | null)?.metadata?.campaign_id ?? null;

  const { data: member } = await supabase
    .from("segment_members")
    .select("segment_id")
    .eq("lead_id", leadId)
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { campaignId, segmentId: (member as { segment_id: string | null } | null)?.segment_id ?? null };
}

export interface PipelineStats {
  /** Sum of deal_value across all open (non-closed) opportunities */
  openValue: number;
  openCount: number;
  /** Sum of deal_value for opportunities marked won */
  wonValue: number;
  wonCount: number;
  lostCount: number;
  /** won / (won + lost) as a percentage, 0 when no closed deals */
  winRate: number;
}
