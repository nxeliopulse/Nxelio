import type { AccountsAnalyticsData } from "@/lib/queries/analytics-accounts";
import { AccountReports } from "@/components/analytics/accounts/account-reports";
import { KpiCard, formatNumber } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

export function AccountsView({ data }: { data: AccountsAnalyticsData }) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Account Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Lightweight account insight — which accounts are engaged, and which need attention.</p>
      </div>

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Accounts" value={formatNumber(kpis.totalAccounts)} href="/accounts" />
            <KpiCard label="Active Accounts" value={formatNumber(kpis.activeAccounts)} href="/accounts" />
            <KpiCard label="With Open Opportunities" value={formatNumber(kpis.accountsWithOpenOpportunities)} href="/opportunities" />
            <KpiCard label="With No Activity" value={formatNumber(kpis.accountsWithNoActivity)} href="/accounts" />
            <KpiCard label="Avg. Engagement Score" value={String(kpis.averageEngagementScore)} />
          </div>

          <AccountReports data={data} />
        </>
      )}
    </div>
  );
}
