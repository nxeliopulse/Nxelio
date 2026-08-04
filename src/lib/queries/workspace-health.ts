export interface WorkspaceHealthCheckInput {
  workspace_id: string;
  workspace_name: string;
  plan_id: string | null;
  plan_name: string;
  status: string | null;
  credits_remaining: number;
  credits_total: number;
  leadCount: number;
  campaignsSent: number;
}

export interface WorkspaceAttentionItem {
  workspace_id: string;
  workspace_name: string;
  type: "danger" | "warning" | "neutral";
  icon: "AlertTriangle" | "Zap" | "Meh";
  label: string;
  reason: string;
}

/** Checks workspace health and returns attention item if flagged. */
export function checkWorkspaceHealth(r: WorkspaceHealthCheckInput): WorkspaceAttentionItem | null {
  // Rule A: "No active plan but has activity" — subscription missing/canceled AND campaigns_sent > 0 or leads > 0
  const isCanceledOrMissing = !r.status || r.status === "canceled";
  const hasActivity = r.campaignsSent > 0 || r.leadCount > 0;
  if (isCanceledOrMissing && hasActivity) {
    return {
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      type: "danger",
      icon: "AlertTriangle",
      label: "No active plan",
      reason: `Subscription missing or canceled but has ${r.leadCount} leads and ${r.campaignsSent} campaigns sent`,
    };
  }

  // Rule B: "Fast credit burn" — credits_remaining / credits_total < 0.3 AND status is active/trialing
  if (r.credits_total > 0 && (r.status === "active" || r.status === "trialing" || r.status === "past_due")) {
    const ratio = r.credits_remaining / r.credits_total;
    if (ratio < 0.3) {
      const isUpsell = r.plan_id === "basic" || r.plan_id === "starter";
      const creditsUsed = r.credits_total - r.credits_remaining;
      return {
        workspace_id: r.workspace_id,
        workspace_name: r.workspace_name,
        type: "warning",
        icon: "Zap",
        label: isUpsell ? "Upsell candidate" : "Fast credit burn",
        reason: `${creditsUsed} of ${r.credits_total} credits used on ${r.plan_name}`,
      };
    }
  }

  // Rule C: "Low engagement despite volume" — leadCount > 50 AND campaignsSent <= 2
  if (r.leadCount > 50 && r.campaignsSent <= 2) {
    return {
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      type: "neutral",
      icon: "Meh",
      label: "re-engagement candidate",
      reason: `${r.leadCount} leads imported but only ${r.campaignsSent} campaigns sent`,
    };
  }

  return null;
}
