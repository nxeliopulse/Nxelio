// Shared opportunity constants + types. Kept out of the "use server" query
// module because a "use server" file may only export async functions.

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
