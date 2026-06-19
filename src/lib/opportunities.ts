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
