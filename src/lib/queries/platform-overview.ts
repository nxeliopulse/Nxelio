"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import {
  WorkspaceHealthCheckInput,
  WorkspaceAttentionItem,
  checkWorkspaceHealth,
} from "./workspace-health";

export {
  type WorkspaceHealthCheckInput,
  type WorkspaceAttentionItem,
  checkWorkspaceHealth,
};

export interface PlatformOverviewStats {
  totalCustomers: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  mrrCents: number;
  planCounts: {
    pro: number;
    starter: number;
    basic: number;
    trialing: number;
    noPlan: number;
  };
}

export interface SubscriptionRow {
  workspace_id: string;
  workspace_name: string;
  plan_id: string;
  plan_name: string;
  billing_interval: string;
  status: string;
  credits_remaining: number;
  credits_total: number;
  current_period_end: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
}

export interface HotCustomerRow extends WorkspaceHealthCheckInput {
  creditsConsumed: number;
  score: number;
}

export interface WorkspaceExtendedData extends WorkspaceHealthCheckInput {
  created_at: string;
  creditsConsumed: number;
  score: number;
}

export interface PlatformOverviewTrendPoint {
  monthName: string;
  totalCustomers: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  mrrCents: number;
}

interface SubscriptionQueryResult {
  workspace_id: string;
  plan_id: string;
  status: string;
  credits_remaining: number;
  credits_total: number;
  created_at: string;
  current_period_end: string;
  subscription_plans: { name: string } | null;
}

interface TrendSubscriptionQueryResult {
  workspace_id: string;
  status: string;
  plan_id: string;
  billing_interval: string;
  current_period_end: string;
  created_at: string;
  subscription_plans: { monthly_price_cents: number; annual_price_cents: number } | null;
}

async function requireAdmin() {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
}

/** Internal helper: aggregates and joins all workspaces with active metrics. */
export async function getWorkspaceExtendedData(): Promise<WorkspaceExtendedData[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: workspaces }, { data: leads }, { data: campaigns }, { data: ledger }, { data: subs }] = await Promise.all([
    admin.from("workspaces").select("id, name, created_at"),
    admin.from("leads").select("workspace_id"),
    admin.from("campaigns").select("workspace_id, sent_count"),
    admin.from("credit_ledger").select("workspace_id, credits_delta").lt("credits_delta", 0),
    admin.from("subscriptions").select("workspace_id, plan_id, status, credits_remaining, credits_total, created_at, current_period_end, subscription_plans(name)"),
  ]);

  const leadCounts = new Map<string, number>();
  for (const l of (leads as { workspace_id: string }[]) || []) {
    leadCounts.set(l.workspace_id, (leadCounts.get(l.workspace_id) || 0) + 1);
  }

  const campaignCounts = new Map<string, number>();
  for (const c of (campaigns as { workspace_id: string; sent_count: number }[]) || []) {
    campaignCounts.set(c.workspace_id, (campaignCounts.get(c.workspace_id) || 0) + (c.sent_count || 0));
  }

  const creditsConsumed = new Map<string, number>();
  for (const e of (ledger as { workspace_id: string; credits_delta: number }[]) || []) {
    creditsConsumed.set(e.workspace_id, (creditsConsumed.get(e.workspace_id) || 0) + Math.abs(e.credits_delta));
  }

  const subByWorkspace = new Map<string, SubscriptionQueryResult>();
  for (const s of (subs as unknown as SubscriptionQueryResult[]) || []) {
    subByWorkspace.set(s.workspace_id, s);
  }

  return ((workspaces as { id: string; name: string; created_at: string }[]) || []).map((w) => {
    const leadCount = leadCounts.get(w.id) || 0;
    const campaignsSent = campaignCounts.get(w.id) || 0;
    const consumed = creditsConsumed.get(w.id) || 0;
    const sub = subByWorkspace.get(w.id);

    return {
      workspace_id: w.id,
      workspace_name: w.name,
      created_at: w.created_at,
      plan_id: sub?.plan_id || null,
      plan_name: sub?.subscription_plans?.name || "No plan",
      status: sub?.status || null,
      credits_remaining: sub?.credits_remaining || 0,
      credits_total: sub?.credits_total || 0,
      leadCount,
      campaignsSent,
      creditsConsumed: consumed,
      score: leadCount + campaignsSent + consumed,
    };
  });
}

/** Top-line stats for the admin Overview tab. */
export async function getPlatformOverviewStats(): Promise<PlatformOverviewStats> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ count: totalCustomers }, { data: subs }] = await Promise.all([
    admin.from("workspaces").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("status, plan_id, billing_interval, subscription_plans(monthly_price_cents, annual_price_cents)"),
  ]);

  const rows = (subs as unknown as Array<{ status: string; billing_interval: string; plan_id: string; subscription_plans: { monthly_price_cents: number; annual_price_cents: number } | null }>) || [];
  const active = rows.filter((r) => r.status === "active");
  const trialing = rows.filter((r) => r.status === "trialing");
  const mrrCents = active.reduce((sum, r) => {
    const plan = r.subscription_plans;
    if (!plan) return sum;
    const monthlyEquiv = r.billing_interval === "annual" ? Math.round(plan.annual_price_cents / 12) : plan.monthly_price_cents;
    return sum + monthlyEquiv;
  }, 0);

  const planCounts = {
    pro: rows.filter((r) => (r.status === "active" || r.status === "past_due") && r.plan_id === "pro").length,
    starter: rows.filter((r) => (r.status === "active" || r.status === "past_due") && r.plan_id === "starter").length,
    basic: rows.filter((r) => (r.status === "active" || r.status === "past_due") && r.plan_id === "basic").length,
    trialing: rows.filter((r) => r.status === "trialing").length,
    noPlan: 0,
  };
  planCounts.noPlan = Math.max(0, (totalCustomers || 0) - (planCounts.pro + planCounts.starter + planCounts.basic + planCounts.trialing));

  return {
    totalCustomers: totalCustomers || 0,
    activeSubscriptions: active.length,
    trialingSubscriptions: trialing.length,
    mrrCents,
    planCounts,
  };
}

/** Every workspace's subscription — view-only, joined with plan details for display. */
export async function getAllSubscriptions(): Promise<SubscriptionRow[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("workspace_id, plan_id, billing_interval, status, credits_remaining, credits_total, current_period_end, trial_ends_at, stripe_customer_id, workspaces(name), subscription_plans(name)")
    .order("current_period_end", { ascending: true });

  return ((data as unknown as Array<{
    workspace_id: string; plan_id: string; billing_interval: string; status: string;
    credits_remaining: number; credits_total: number; current_period_end: string; trial_ends_at: string | null; stripe_customer_id: string | null;
    workspaces: { name: string } | null; subscription_plans: { name: string } | null;
  }>) || []).map((r) => ({
    workspace_id: r.workspace_id,
    workspace_name: r.workspaces?.name || "Unknown",
    plan_id: r.plan_id,
    plan_name: r.subscription_plans?.name || r.plan_id,
    billing_interval: r.billing_interval,
    status: r.status,
    credits_remaining: r.credits_remaining,
    credits_total: r.credits_total,
    current_period_end: r.current_period_end,
    trial_ends_at: r.trial_ends_at,
    stripe_customer_id: r.stripe_customer_id,
  }));
}

/** Most-active workspaces, ranked by score. */
export async function getHotCustomers(limit = 10): Promise<HotCustomerRow[]> {
  await requireAdmin();
  const data = await getWorkspaceExtendedData();
  return data
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      plan_name: r.plan_name,
      leadCount: r.leadCount,
      campaignsSent: r.campaignsSent,
      creditsConsumed: r.creditsConsumed,
      score: r.score,
      credits_total: r.credits_total,
      credits_remaining: r.credits_remaining,
      status: r.status,
      plan_id: r.plan_id,
    }));
}

/** Retrieves workspaces that flag attention checks. */
export async function getWorkspacesNeedingAttention(): Promise<WorkspaceAttentionItem[]> {
  await requireAdmin();
  const data = await getWorkspaceExtendedData();
  const items: WorkspaceAttentionItem[] = [];
  for (const r of data) {
    const item = checkWorkspaceHealth(r);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/** Generates historical trend data points for the last 6 months. */
export async function getPlatformOverviewTrend(): Promise<PlatformOverviewTrendPoint[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: workspaces }, { data: subs }] = await Promise.all([
    admin.from("workspaces").select("id, created_at"),
    admin.from("subscriptions").select("workspace_id, status, plan_id, billing_interval, current_period_end, created_at, subscription_plans(monthly_price_cents, annual_price_cents)"),
  ]);

  const ws = (workspaces as { id: string; created_at: string }[]) || [];
  const rows = (subs as unknown as TrendSubscriptionQueryResult[]) || [];

  const trendPoints: PlatformOverviewTrendPoint[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthName = d.toLocaleString("default", { month: "short" });

    // 1. Total Customers
    const totalCustomers = ws.filter((w) => new Date(w.created_at) <= end).length;

    // 2. Active, Trialing, and MRR
    let activeSubscriptions = 0;
    let trialingSubscriptions = 0;
    let mrrCents = 0;

    for (const s of rows) {
      const subCreated = new Date(s.created_at);
      if (subCreated > end) continue;

      const currentPeriodEnd = s.current_period_end ? new Date(s.current_period_end) : null;
      const plan = s.subscription_plans;
      const monthlyPrice = plan
        ? (s.billing_interval === "annual" ? Math.round(plan.annual_price_cents / 12) : plan.monthly_price_cents)
        : 0;

      let isActiveInMonth = false;
      let isTrialingInMonth = false;

      if (s.status === "active" || s.status === "past_due") {
        isActiveInMonth = true;
      } else if (s.status === "trialing") {
        isTrialingInMonth = true;
      } else if (s.status === "canceled") {
        if (currentPeriodEnd && currentPeriodEnd >= start) {
          isActiveInMonth = true;
        }
      }

      if (isActiveInMonth) {
        activeSubscriptions++;
        mrrCents += monthlyPrice;
      } else if (isTrialingInMonth) {
        trialingSubscriptions++;
      }
    }

    trendPoints.push({
      monthName,
      totalCustomers,
      activeSubscriptions,
      trialingSubscriptions,
      mrrCents,
    });
  }

  return trendPoints;
}
