"use server";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { isStalled } from "@/lib/analytics/pipeline-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { filterAndRecordRecommendations } from "@/lib/queries/ai-recommendations";

interface AccountRow {
  id: string;
  account_name: string;
  account_owner: string | null;
  industry: string | null;
  employees: number | null;
  created_at: string;
  updated_at: string;
}

interface OppRow {
  id: string;
  account_id: string | null;
  deal_value: number;
  stage: OpportunityStage;
  updated_at: string;
}

export interface AccountSizeSlice {
  label: string;
  count: number;
}

export interface AccountBreakdownRow {
  label: string;
  count: number;
}

export interface TopAccountRow {
  id: string;
  name: string;
  value: number;
}

export interface StalledAccountRow {
  accountId: string;
  accountName: string;
  opportunityCount: number;
  daysStalled: number;
}

export interface AccountsFilters {
  industry?: string;
}

export interface AccountsAiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface AccountsAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    totalAccounts: number;
    activeAccounts: number;
    accountsWithOpenOpportunities: number;
    accountsWithNoActivity: number;
    averageEngagementScore: number;
    totalPipeline: number;
    closedWonRevenue: number;
    averageRevenuePerAccount: number;
    accountsAtRisk: number;
  };
  byIndustry: AccountBreakdownRow[];
  bySize: AccountSizeSlice[];
  byPipelineValue: TopAccountRow[];
  byRevenue: TopAccountRow[];
  stalledAccounts: StalledAccountRow[];
  topEngaged: (TopAccountRow & { score: number })[];
  aiInsights: AccountsAiInsight[];
  lastUpdatedAt: string;
}

function sizeLabelFor(employees: number | null): string {
  if (employees == null) return "Unknown";
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 1000) return "201-1000";
  return "1000+";
}

export async function getAccountsAnalytics(filters: AccountsFilters = {}): Promise<AccountsAnalyticsData> {
  const supabase = await createClient();
  await getAnalyticsContext();
  const now = new Date();

  let accountsQuery = supabase.from("accounts").select("id, account_name, account_owner, industry, employees, created_at, updated_at");
  if (filters.industry) accountsQuery = accountsQuery.eq("industry", filters.industry);
  const { data: accountsData } = await accountsQuery;
  const accounts = (accountsData as AccountRow[]) || [];
  const accountIds = accounts.map((a) => a.id);

  let contacts: { id: string; account_id: string | null; updated_at: string }[] = [];
  let opps: OppRow[] = [];
  if (accountIds.length) {
    const [{ data: contactsData }, { data: oppsData }] = await Promise.all([
      supabase.from("contacts").select("id, account_id, updated_at").in("account_id", accountIds),
      supabase.from("opportunities").select("id, account_id, deal_value, stage, updated_at").in("account_id", accountIds),
    ]);
    contacts = (contactsData as typeof contacts) || [];
    opps = (oppsData as OppRow[]) || [];
  }

  const contactsByAccount = new Map<string, typeof contacts>();
  for (const c of contacts) {
    if (!c.account_id) continue;
    if (!contactsByAccount.has(c.account_id)) contactsByAccount.set(c.account_id, []);
    contactsByAccount.get(c.account_id)!.push(c);
  }
  const oppsByAccount = new Map<string, OppRow[]>();
  for (const o of opps) {
    if (!o.account_id) continue;
    if (!oppsByAccount.has(o.account_id)) oppsByAccount.set(o.account_id, []);
    oppsByAccount.get(o.account_id)!.push(o);
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const accountScores = accounts.map((a) => {
    const accContacts = contactsByAccount.get(a.id) || [];
    const accOpps = oppsByAccount.get(a.id) || [];
    const openOpps = accOpps.filter((o) => !CLOSED_STAGES.includes(o.stage));
    const recentActivity =
      new Date(a.updated_at) > thirtyDaysAgo ||
      accContacts.some((c) => new Date(c.updated_at) > thirtyDaysAgo) ||
      accOpps.some((o) => new Date(o.updated_at) > thirtyDaysAgo);
    // Lightweight, explicitly-not-a-CS-health-score per the doc's own
    // instruction: contacts + open deals + recent touch, capped at 100.
    const score = Math.min(100, accContacts.length * 10 + openOpps.length * 15 + (recentActivity ? 20 : 0));
    return { account: a, accContacts, accOpps, openOpps, recentActivity, score };
  });

  const activeAccounts = accountScores.filter((s) => s.accContacts.length > 0 || s.accOpps.length > 0);
  const noActivityAccounts = accountScores.filter((s) => s.accContacts.length === 0 && s.accOpps.length === 0);
  const withOpenOpps = accountScores.filter((s) => s.openOpps.length > 0);

  const byIndustryMap = new Map<string, number>();
  for (const a of accounts) byIndustryMap.set(a.industry || "Other", (byIndustryMap.get(a.industry || "Other") || 0) + 1);
  const byIndustry: AccountBreakdownRow[] = Array.from(byIndustryMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const bySizeMap = new Map<string, number>();
  for (const a of accounts) {
    const label = sizeLabelFor(a.employees);
    bySizeMap.set(label, (bySizeMap.get(label) || 0) + 1);
  }
  const bySize: AccountSizeSlice[] = Array.from(bySizeMap.entries()).map(([label, count]) => ({ label, count }));

  const byPipelineValue: TopAccountRow[] = accountScores
    .map((s) => ({ id: s.account.id, name: s.account.account_name, value: s.openOpps.reduce((sum, o) => sum + Number(o.deal_value || 0), 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const byRevenue: TopAccountRow[] = accountScores
    .map((s) => ({ id: s.account.id, name: s.account.account_name, value: s.accOpps.filter((o) => o.stage === "won").reduce((sum, o) => sum + Number(o.deal_value || 0), 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const stalledAccounts: StalledAccountRow[] = accountScores
    .filter((s) => s.openOpps.length > 0 && s.openOpps.every((o) => isStalled(o.updated_at, now.toISOString(), 14)))
    .map((s) => ({
      accountId: s.account.id,
      accountName: s.account.account_name,
      opportunityCount: s.openOpps.length,
      daysStalled: Math.max(...s.openOpps.map((o) => Math.floor((now.getTime() - new Date(o.updated_at).getTime()) / 86_400_000))),
    }))
    .sort((a, b) => b.daysStalled - a.daysStalled)
    .slice(0, 20);

  const topEngaged = accountScores
    .map((s) => ({ id: s.account.id, name: s.account.account_name, value: s.score, score: s.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const totalPipeline = accountScores.reduce((s, a) => s + a.openOpps.reduce((sum, o) => sum + Number(o.deal_value || 0), 0), 0);
  const closedWonRevenue = accountScores.reduce((s, a) => s + a.accOpps.filter((o) => o.stage === "won").reduce((sum, o) => sum + Number(o.deal_value || 0), 0), 0);
  // "At risk" — has open pipeline but every one of those deals is stalled
  // (same signal already used for the Stalled Accounts table), reused here
  // as this schema's risk proxy rather than a separate, undocumented score.
  const accountsAtRisk = stalledAccounts.length;

  const aiInsights: AccountsAiInsight[] = [];
  if (noActivityAccounts.length > 0) {
    aiInsights.push({ id: "no_activity", title: `${noActivityAccounts.length} accounts have no contacts or opportunities at all.`, ctaLabel: "View Accounts", ctaHref: "/accounts" });
  }
  if (stalledAccounts.length > 0) {
    aiInsights.push({ id: "at_risk", title: `${stalledAccounts.length} accounts have open opportunities with no activity for 14+ days.`, ctaLabel: "Review At-Risk Accounts", ctaHref: "/accounts" });
  }
  const topRevenueAccount = byRevenue[0];
  if (topRevenueAccount) {
    aiInsights.push({ id: "top_account", title: `${topRevenueAccount.name} is your highest-revenue account at $${Math.round(topRevenueAccount.value).toLocaleString()}.`, ctaLabel: "View Account", ctaHref: "/accounts" });
  }

  return {
    hasAnyData: accounts.length > 0,
    kpis: {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      accountsWithOpenOpportunities: withOpenOpps.length,
      accountsWithNoActivity: noActivityAccounts.length,
      averageEngagementScore: accountScores.length ? Math.round(accountScores.reduce((s, a) => s + a.score, 0) / accountScores.length) : 0,
      totalPipeline,
      closedWonRevenue,
      averageRevenuePerAccount: accounts.length ? Math.round(closedWonRevenue / accounts.length) : 0,
      accountsAtRisk,
    },
    byIndustry,
    bySize,
    byPipelineValue,
    byRevenue,
    stalledAccounts,
    topEngaged,
    aiInsights: await filterAndRecordRecommendations("accounts", aiInsights),
    lastUpdatedAt: new Date().toISOString(),
  };
}
