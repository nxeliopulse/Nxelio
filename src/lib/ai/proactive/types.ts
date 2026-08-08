export type ProactiveSignalKind =
  | "campaign_performance_drop"
  | "email_bounce_increase"
  | "inactive_leads"
  | "pipeline_stagnation"
  | "missing_followups"
  | "credit_usage"
  | "subscription_reminder";

export type ProactiveSeverity = "critical" | "warning" | "info";

export interface ProactiveSignal {
  fingerprint: string;
  kind: ProactiveSignalKind;
  severity: ProactiveSeverity;
  title: string;
  message: string;
  recommendation: string;
  link: string;
  entityId?: string;
  metadata: Record<string, unknown>;
}

export interface ProactiveCampaignSnapshot {
  id: string;
  name: string;
  sent: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
}

export interface ProactiveLeadSnapshot {
  id: string;
  name: string;
  status: string | null;
  lastActivityAt: string | null;
}

export interface ProactiveOpportunitySnapshot {
  id: string;
  name: string;
  stage: string;
  updatedAt: string | null;
}

export interface ProactiveSnapshot {
  campaigns: ProactiveCampaignSnapshot[];
  leads: ProactiveLeadSnapshot[];
  opportunities: ProactiveOpportunitySnapshot[];
  overdueFollowups: number;
  creditsRemaining: number | null;
  creditsTotal: number | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
}
