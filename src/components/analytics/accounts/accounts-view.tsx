import type { AccountsAnalyticsData, AccountsFilters } from "@/lib/queries/analytics-accounts";
import { AccountsFilterBar } from "@/components/analytics/accounts/accounts-filter-bar";
import { AccountReports } from "@/components/analytics/accounts/account-reports";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";

export function AccountsView({ data, filters, industries }: { data: AccountsAnalyticsData; filters: AccountsFilters; industries: string[] }) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Account Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Lightweight account insight — which accounts are engaged, and which need attention.</p>
      </div>

      <AccountsFilterBar filters={filters} industries={industries} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Accounts" value={formatNumber(kpis.totalAccounts)} href="/accounts" />
            <KpiCard label="Active Accounts" value={formatNumber(kpis.activeAccounts)} href="/accounts" />
            <KpiCard label="With Open Opportunities" value={formatNumber(kpis.accountsWithOpenOpportunities)} href="/opportunities" />
            <KpiCard label="Total Pipeline" value={formatCurrency(kpis.totalPipeline)} href="/opportunities" />
            <KpiCard label="Closed-Won Revenue" value={formatCurrency(kpis.closedWonRevenue)} href="/opportunities" />
            <KpiCard label="Avg Revenue / Account" value={formatCurrency(kpis.averageRevenuePerAccount)} />
            <KpiCard label="Accounts at Risk" value={formatNumber(kpis.accountsAtRisk)} href="/accounts" />
            <KpiCard label="With No Activity" value={formatNumber(kpis.accountsWithNoActivity)} href="/accounts" />
            <KpiCard label="Avg. Engagement Score" value={String(kpis.averageEngagementScore)} />
          </div>

          <AccountReports data={data} />

          <AiInsightsPanel area="accounts" insights={data.aiInsights} heading="AI Account Insights" />
        </>
      )}
    </div>
  );
}
