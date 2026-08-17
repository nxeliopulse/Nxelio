import type { PipelineAnalyticsData, PipelineFilters } from "@/lib/queries/analytics-pipeline";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { PipelineFilterBar } from "@/components/analytics/pipeline/pipeline-filter-bar";
import { StageDetailTable } from "@/components/analytics/pipeline/stage-detail-table";
import { AgingChart } from "@/components/analytics/pipeline/aging-chart";
import { StalledTable } from "@/components/analytics/pipeline/stalled-table";
import { StageConversionTable } from "@/components/analytics/pipeline/stage-conversion-table";
import { WinLossPanel } from "@/components/analytics/pipeline/win-loss-panel";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";

export function PipelineView({
  data,
  filters,
  showTeamFilter,
  sources,
  ownerNames,
}: {
  data: PipelineAnalyticsData;
  filters: PipelineFilters;
  showTeamFilter: boolean;
  sources: string[];
  ownerNames: Record<string, string>;
}) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Pipeline & Opportunities Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Which opportunities are aging or stalled, and how the pipeline is converting.</p>
      </div>

      <PipelineFilterBar filters={filters} showTeamFilter={showTeamFilter} sources={sources} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            <KpiCard label="Open Opportunities" value={formatNumber(kpis.openOpportunities)} href="/opportunities" />
            <KpiCard label="Open Pipeline Value" value={formatCurrency(kpis.openPipelineValue)} href="/opportunities" />
            <KpiCard label="Weighted Pipeline" value={formatCurrency(kpis.weightedPipelineValue)} href="/opportunities" />
            <KpiCard label="Closed-Won Revenue" value={formatCurrency(kpis.closedWonRevenue)} href="/opportunities" />
            <KpiCard label="Average Deal Size" value={formatCurrency(kpis.averageDealSize)} />
            <KpiCard label="Win Rate" value={`${kpis.winRate}%`} href="/opportunities" />
            <KpiCard label="Lost Rate" value={`${kpis.lostRate}%`} href="/opportunities" />
            <KpiCard label="Average Sales Cycle" value={kpis.averageSalesCycleDays != null ? `${kpis.averageSalesCycleDays}d` : "—"} />
            <KpiCard label="Stalled Opportunities" value={formatNumber(kpis.stalledOpportunities)} href="/opportunities" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StageDetailTable rows={data.byStage} />
            <AgingChart rows={data.aging} />
          </div>

          <Card>
            <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Pipeline by Source</CardTitle></CardHeader>
            <BarChartWidget config={{ chartType: "bar", title: "Pipeline by Source", unit: "currency" }} data={data.bySource.map((s) => ({ label: s.label, value: Math.round(s.pipeline) }))} />
          </Card>

          <StalledTable rows={data.stalled} ownerNames={ownerNames} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StageConversionTable rows={data.stageConversion} />
            <WinLossPanel winLoss={data.winLoss} />
          </div>

          <AiInsightsPanel area="pipeline" insights={data.aiInsights} heading="AI Pipeline Insights" />
        </>
      )}
    </div>
  );
}
