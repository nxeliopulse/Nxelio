// Shared types and constants for the cancellation retention system.
// This file has NO "use server" directive so it can be imported by both
// server actions and client components.

export type CancellationReason =
  | "too_expensive"
  | "missing_features"
  | "found_alternative"
  | "not_using"
  | "technical_issues"
  | "business_closed"
  | "other";

export const REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "It's too expensive",
  missing_features: "Missing features I need",
  found_alternative: "Found a better alternative",
  not_using: "Not using it enough",
  technical_issues: "Technical problems",
  business_closed: "Business closed or changed",
  other: "Other reason",
};

export type CancellationStatus =
  | "pending"
  | "meeting_scheduled"
  | "retained"
  | "cancelled"
  | "follow_up_required"
  | "no_response";

export interface CancellationRequest {
  id: string;
  workspace_id: string;
  customer_name: string | null;
  customer_email: string;
  plan_id: string | null;
  reason: CancellationReason;
  feedback: string | null;
  wants_meeting: boolean;
  meeting_provider: "zoom" | "google_meet" | null;
  preferred_date: string | null;
  preferred_time: string | null;
  meeting_link: string | null;
  meeting_scheduled_at: string | null;
  status: CancellationStatus;
  admin_notes: string | null;
  retention_offer: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
