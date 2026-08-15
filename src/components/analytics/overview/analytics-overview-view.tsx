import type { OverviewData, OverviewFilters } from "@/lib/queries/analytics-overview";
import { GlobalFilterBar } from "@/components/analytics/overview/global-filter-bar";
import { KpiCard, formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { PipelineStageChart } from "@/components/analytics/overview/pipeline-stage-chart";
import { RevenueTrendChart } from "@/components/analytics/overview/revenue-trend-chart";
import { TopCampaignsTable } from "@/components/analytics/overview/top-campaigns-table";
import { AiInsightsPanel } from "@/components/analytics/overview/ai-insights-panel";
import { QuickReportsPanel } from "@/components/analytics/overview/quick-reports-panel";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

interface AnalyticsOverviewViewProps {
  data: OverviewData;
  filters: OverviewFilters;
  campaigns: { id: string; campaign_name: string }[];
  segments: { id: string; segment_name: string }[];
  industries: string[];
  sources: string[];
  users: { id: string; name: string }[];
}

export function AnalyticsOverviewView({ data, filters, campaigns, segments, industries, sources, users }: AnalyticsOverviewViewProps) {
  const { kpis } = data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Analytics Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">Get a real-time overview of your nurture, engagement, pipeline and revenue performance.</p>
      </div>

      <GlobalFilterBar
        filters={filters}
        campaigns={campaigns}
        segments={segments}
        industries={industries}
        sources={sources}
        users={users}
        showTeamFilter={data.showTeamFilter}
        data={data}
      />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Prospects" value={formatNumber(kpis.totalProspects.value)} changePercent={kpis.totalProspects.changePercent} href="/leads" />
            <KpiCard label="Replies Received" value={formatNumber(kpis.replies.value)} detail={`${kpis.replies.replyRate}% reply rate`} href="/activities/emails" />
            <KpiCard label="Meetings Booked" value={formatNumber(kpis.meetings.value)} changePercent={kpis.meetings.changePercent} href="/meetings" />
            <KpiCard label="Qualified Prospects" value={formatNumber(kpis.qualified.value)} href="/leads" />
            <KpiCard label="Open Pipeline" value={formatCurrency(kpis.openPipeline.value)} changePercent={kpis.openPipeline.changePercent} href="/opportunities" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Closed-Won Revenue" value={formatCurrency(kpis.closedWonRevenue.value)} changePercent={kpis.closedWonRevenue.changePercent} href="/opportunities" />
            <KpiCard label="Win Rate" value={`${kpis.winRate.value}%`} detail={`${kpis.winRate.won} won / ${kpis.winRate.lost} lost`} href="/opportunities" />
            <KpiCard label="Forecast (Weighted)" value={formatCurrency(kpis.weightedForecast.value)} changePercent={kpis.weightedForecast.changePercent} />
            <KpiCard
              label="Active Campaigns"
              value={formatNumber(kpis.activeCampaigns.active)}
              detail={`${kpis.activeCampaigns.paused} paused · ${kpis.activeCampaigns.needsAttention} need attention`}
              href="/campaigns"
            />
            <KpiCard label="High-Priority Prospects" value={formatNumber(kpis.highPriorityProspects.count)} detail={kpis.highPriorityProspects.thresholdText} href="/leads" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">
            <RevenueFunnel stages={data.funnel} />
            <PipelineStageChart stages={data.pipelineByStage} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1"><RevenueTrendChart points={data.revenueTrend} /></div>
            <div className="lg:col-span-1"><TopCampaignsTable campaigns={data.topCampaigns} /></div>
            <div className="lg:col-span-1"><AiInsightsPanel insights={data.aiInsights} /></div>
          </div>

          <QuickReportsPanel reports={data.quickReports} />
        </>
      )}
    </div>
  );
}
