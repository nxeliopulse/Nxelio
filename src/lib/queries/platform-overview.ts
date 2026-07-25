"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";

export interface PlatformOverviewStats {
  totalCustomers: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  mrrCents: number;
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
  stripe_customer_id: string | null;
}

export interface HotCustomerRow {
  workspace_id: string;
  workspace_name: string;
  plan_name: string;
  leadCount: number;
  campaignsSent: number;
  creditsConsumed: number;
  score: number;
}

async function requireAdmin() {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
}

/** Top-line stats for the admin Overview tab. */
export async function getPlatformOverviewStats(): Promise<PlatformOverviewStats> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ count: totalCustomers }, { data: subs }] = await Promise.all([
    admin.from("workspaces").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("status, billing_interval, plan_id, subscription_plans(monthly_price_cents, annual_price_cents)"),
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

  return {
    totalCustomers: totalCustomers || 0,
    activeSubscriptions: active.length,
    trialingSubscriptions: trialing.length,
    mrrCents,
  };
}

/** Every workspace's subscription — view-only, joined with plan details for display. */
export async function getAllSubscriptions(): Promise<SubscriptionRow[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("workspace_id, plan_id, billing_interval, status, credits_remaining, credits_total, current_period_end, stripe_customer_id, workspaces(name), subscription_plans(name)")
    .order("current_period_end", { ascending: true });

  return ((data as unknown as Array<{
    workspace_id: string; plan_id: string; billing_interval: string; status: string;
    credits_remaining: number; credits_total: number; current_period_end: string; stripe_customer_id: string | null;
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
    stripe_customer_id: r.stripe_customer_id,
  }));
}

/**
 * Most-active workspaces, ranked by a simple engagement score: leads imported +
 * campaigns sent + AI credits consumed. No single metric here is "correct" —
 * this is a usage signal for account management, not a precise ranking.
 */
export async function getHotCustomers(limit = 10): Promise<HotCustomerRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: workspaces }, { data: leads }, { data: campaigns }, { data: ledger }, { data: subs }] = await Promise.all([
    admin.from("workspaces").select("id, name"),
    admin.from("leads").select("workspace_id"),
    admin.from("campaigns").select("workspace_id, sent_count"),
    admin.from("credit_ledger").select("workspace_id, credits_delta").lt("credits_delta", 0),
    admin.from("subscriptions").select("workspace_id, subscription_plans(name)"),
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
  const planByWorkspace = new Map<string, string>();
  for (const s of (subs as unknown as { workspace_id: string; subscription_plans: { name: string } | null }[]) || []) {
    planByWorkspace.set(s.workspace_id, s.subscription_plans?.name || "—");
  }

  const rows: HotCustomerRow[] = ((workspaces as { id: string; name: string }[]) || []).map((w) => {
    const leadCount = leadCounts.get(w.id) || 0;
    const campaignsSent = campaignCounts.get(w.id) || 0;
    const consumed = creditsConsumed.get(w.id) || 0;
    return {
      workspace_id: w.id,
      workspace_name: w.name,
      plan_name: planByWorkspace.get(w.id) || "—",
      leadCount,
      campaignsSent,
      creditsConsumed: consumed,
      score: leadCount + campaignsSent + consumed,
    };
  });

  return rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
