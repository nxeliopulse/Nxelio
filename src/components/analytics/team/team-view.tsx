import type { TeamAnalyticsData } from "@/lib/queries/analytics-team";
import { RepLeaderboardTable } from "@/components/analytics/team/rep-leaderboard-table";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function TeamView({ data }: { data: TeamAnalyticsData }) {
  const { kpis, responseTime } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Team Performance Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {data.scopedToSelf ? "Your own performance — rep comparisons are available to managers and admins." : "How each rep is performing across prospecting, engagement and revenue."}
        </p>
      </div>

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Prospects Assigned" value={formatNumber(kpis.prospectsAssigned)} href="/leads" />
            <KpiCard label="Emails Sent" value={formatNumber(kpis.emailsSent)} />
            <KpiCard label="Replies" value={formatNumber(kpis.replies)} />
            <KpiCard label="Meetings" value={formatNumber(kpis.meetings)} href="/meetings" />
            <KpiCard label="Qualified Prospects" value={formatNumber(kpis.qualifiedProspects)} />
            <KpiCard label="Opportunities" value={formatNumber(kpis.opportunities)} href="/opportunities" />
            <KpiCard label="Pipeline Generated" value={formatCurrency(kpis.pipelineGenerated)} />
            <KpiCard label="Revenue Won" value={formatCurrency(kpis.revenueWon)} />
            <KpiCard label="Tasks Completed" value={formatNumber(kpis.tasksCompleted)} />
          </div>

          <RepLeaderboardTable rows={data.leaderboard} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Activity by Channel</CardTitle></CardHeader>
              <BarChartWidget config={{ chartType: "bar", title: "Activity by Channel" }} data={data.activityBreakdown.map((r) => ({ label: r.channel, value: r.count }))} />
            </Card>
            <Card className="p-5">
              <CardHeader className="p-0 border-0 mb-3"><CardTitle className="text-sm">Response Time (inbound reply → rep response)</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-400">Average</p><p className="text-lg font-black text-slate-900">{responseTime.averageMinutes != null ? `${responseTime.averageMinutes}m` : "—"}</p></div>
                <div><p className="text-xs text-slate-400">Median</p><p className="text-lg font-black text-slate-900">{responseTime.medianMinutes != null ? `${responseTime.medianMinutes}m` : "—"}</p></div>
                <div><p className="text-xs text-slate-400">Under 1 Hour</p><p className="text-lg font-black text-emerald-600">{responseTime.underOneHourPercent}%</p></div>
                <div><p className="text-xs text-slate-400">Over 24 Hours</p><p className="text-lg font-black text-rose-600">{responseTime.overOneDayPercent}%</p></div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
