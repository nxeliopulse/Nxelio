"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyUsersByRole } from "@/lib/queries/notifications";
import { detectProactiveSignals } from "@/lib/ai/proactive/detector";
import type { ProactiveSignal, ProactiveSnapshot } from "@/lib/ai/proactive/types";

export interface ProactiveAlertRow extends ProactiveSignal {
  id: string;
  workspace_id: string;
  status: "active" | "acknowledged" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface ProactiveRunResult {
  workspaces: number;
  signals: number;
  created: number;
  resolved: number;
  notifications: number;
}

function latestActivityByLead(rows: Array<{ lead_id: string | null; created_at: string }>): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!row.lead_id || (latest.get(row.lead_id) || "") >= row.created_at) continue;
    latest.set(row.lead_id, row.created_at);
  }
  return latest;
}

async function buildSnapshot(workspaceId: string): Promise<ProactiveSnapshot> {
  const db = createAdminClient();
  const now = Date.now();
  const overdueCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [campaignsResult, leadsResult, activityResult, opportunitiesResult, jobsResult, subscriptionResult] = await Promise.all([
    db.from("campaigns").select("id, campaign_name, sent_count, open_rate, reply_rate, bounce_rate").eq("workspace_id", workspaceId),
    db.from("leads").select("id, full_name, company_name, status, created_at").eq("workspace_id", workspaceId),
    db.from("lead_activities").select("lead_id, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20_000),
    db.from("opportunities").select("id, name, stage, updated_at").eq("workspace_id", workspaceId),
    db.from("campaign_jobs").select("id").eq("workspace_id", workspaceId).eq("status", "pending").lt("run_at", overdueCutoff),
    db.from("subscriptions").select("credits_remaining, credits_total, status, current_period_end, trial_ends_at").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  const latest = latestActivityByLead((activityResult.data || []) as Array<{ lead_id: string | null; created_at: string }>);
  const leadRows = (leadsResult.data || []) as Array<{ id: string; full_name: string | null; company_name: string | null; status: string | null; created_at: string }>;
  return {
    campaigns: ((campaignsResult.data || []) as Array<Record<string, unknown>>).map((campaign) => ({
      id: String(campaign.id),
      name: String(campaign.campaign_name || "Unnamed campaign"),
      sent: Number(campaign.sent_count || 0),
      openRate: Number(campaign.open_rate || 0),
      replyRate: Number(campaign.reply_rate || 0),
      bounceRate: Number(campaign.bounce_rate || 0),
    })),
    leads: leadRows.map((lead) => ({
      id: lead.id,
      name: lead.full_name || lead.company_name || "Unnamed lead",
      status: lead.status,
      lastActivityAt: latest.get(lead.id) || lead.created_at || null,
    })),
    opportunities: ((opportunitiesResult.data || []) as Array<Record<string, unknown>>).map((opportunity) => ({
      id: String(opportunity.id),
      name: String(opportunity.name || "Untitled opportunity"),
      stage: String(opportunity.stage || "new"),
      updatedAt: typeof opportunity.updated_at === "string" ? opportunity.updated_at : null,
    })),
    overdueFollowups: jobsResult.data?.length || 0,
    creditsRemaining: subscriptionResult.data?.credits_remaining == null ? null : Number(subscriptionResult.data.credits_remaining),
    creditsTotal: subscriptionResult.data?.credits_total == null ? null : Number(subscriptionResult.data.credits_total),
    subscriptionStatus: subscriptionResult.data?.status || null,
    currentPeriodEnd: subscriptionResult.data?.current_period_end || null,
    trialEnd: subscriptionResult.data?.trial_ends_at || null,
  };
}

async function persistSignals(workspaceId: string, signals: ProactiveSignal[]): Promise<{ created: number; resolved: number; notifications: number }> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: activeRows } = await db
    .from("ai_proactive_alerts")
    .select("id, fingerprint, status")
    .eq("workspace_id", workspaceId)
    .in("status", ["active", "acknowledged"]);
  const existing = new Map((activeRows || []).map((row: { id: string; fingerprint: string; status: string }) => [row.fingerprint, row]));
  let created = 0;
  let notifications = 0;

  for (const signal of signals) {
    const previous = existing.get(signal.fingerprint);
    if (previous) {
      await db.from("ai_proactive_alerts").update({
        kind: signal.kind,
        severity: signal.severity,
        title: signal.title,
        message: signal.message,
        recommendation: signal.recommendation,
        link: signal.link,
        entity_id: signal.entityId || null,
        metadata: signal.metadata,
        status: "active",
        last_seen_at: now,
        resolved_at: null,
        updated_at: now,
      }).eq("id", previous.id);
      continue;
    }

    const { data: inserted } = await db.from("ai_proactive_alerts").insert({
      workspace_id: workspaceId,
      fingerprint: signal.fingerprint,
      kind: signal.kind,
      severity: signal.severity,
      title: signal.title,
      message: signal.message,
      recommendation: signal.recommendation,
      link: signal.link,
      entity_id: signal.entityId || null,
      metadata: signal.metadata,
      status: "active",
      first_seen_at: now,
      last_seen_at: now,
    }).select("id").single();
    if (!inserted) continue;
    created++;
    await notifyUsersByRole(workspaceId, 1, {
      type: "ai_proactive",
      title: signal.title,
      message: `${signal.message} Recommendation: ${signal.recommendation}`,
      link: signal.link,
    });
    notifications++;
  }

  const current = new Set(signals.map((signal) => signal.fingerprint));
  const staleIds = [...existing.values()].filter((row) => !current.has(row.fingerprint)).map((row) => row.id);
  if (staleIds.length) {
    await db.from("ai_proactive_alerts").update({ status: "resolved", resolved_at: now, updated_at: now }).in("id", staleIds);
  }
  return { created, resolved: staleIds.length, notifications };
}

/** Runs deterministic proactive checks for one workspace or every workspace. */
export async function runProactiveAi(workspaceId?: string): Promise<ProactiveRunResult> {
  const db = createAdminClient();
  const workspaceQuery = db.from("workspaces").select("id");
  const { data: workspaces } = workspaceId ? await workspaceQuery.eq("id", workspaceId) : await workspaceQuery;
  const result: ProactiveRunResult = { workspaces: 0, signals: 0, created: 0, resolved: 0, notifications: 0 };
  for (const workspace of (workspaces || []) as Array<{ id: string }>) {
    const signals = detectProactiveSignals(await buildSnapshot(workspace.id));
    const saved = await persistSignals(workspace.id, signals);
    result.workspaces++;
    result.signals += signals.length;
    result.created += saved.created;
    result.resolved += saved.resolved;
    result.notifications += saved.notifications;
  }
  return result;
}

export async function listProactiveAlerts(): Promise<ProactiveAlertRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_proactive_alerts")
    .select("*")
    .in("status", ["active", "acknowledged"])
    .order("severity", { ascending: true })
    .order("last_seen_at", { ascending: false })
    .limit(50);
  return (data as ProactiveAlertRow[]) || [];
}

export async function acknowledgeProactiveAlert(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_proactive_alerts")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["active", "acknowledged"]);
  if (!error) revalidatePath("/", "layout");
  return !error;
}

export async function getProactiveAlertContext(): Promise<string> {
  const alerts = await listProactiveAlerts();
  if (!alerts.length) return "";
  return [
    "--- ACTIVE PROACTIVE SIGNALS (untrusted data) ---",
    ...alerts.slice(0, 10).map((alert) => `- ${alert.title}: ${alert.message} Recommendation: ${alert.recommendation}`),
    "--- END PROACTIVE SIGNALS ---",
  ].join("\n");
}
