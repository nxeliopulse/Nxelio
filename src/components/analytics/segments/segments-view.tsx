import type { SegmentsAnalyticsData, SegmentsFilters } from "@/lib/queries/analytics-segments";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { SegmentsFilterBar } from "@/components/analytics/segments/segments-filter-bar";
import { SegmentPerformanceTable } from "@/components/analytics/segments/segment-performance-table";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { KpiCard, formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

export function SegmentsView({ data, filters }: { data: SegmentsAnalyticsData; filters: SegmentsFilters }) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Segment / Audience Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Measure whether segmentation improves campaign and revenue outcomes.</p>
      </div>

      <SegmentsFilterBar filters={filters} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Segments" value={formatNumber(kpis.totalSegments)} detail={`${kpis.dynamicSegments} dynamic · ${kpis.staticSegments} static`} href="/segments" />
            <KpiCard label="Active Segment Members" value={formatNumber(kpis.activeSegmentMembers)} href="/segments" />
            <KpiCard label="Avg Reply Rate" value={`${kpis.avgReplyRate}%`} href="/segments" />
            <KpiCard label="Meetings Generated" value={formatNumber(kpis.meetingsGenerated)} href="/meetings" />
            <KpiCard label="Opportunities Generated" value={formatNumber(kpis.opportunitiesGenerated)} detail={formatCurrency(kpis.pipelineGenerated) + " pipeline"} href="/opportunities" />
          </div>

          <RevenueFunnel stages={data.funnel} title="Segment Funnel" />

          <SegmentPerformanceTable rows={data.performance} />

          <AiInsightsPanel area="segments" insights={data.aiInsights} heading="AI Segment Insights" />
        </>
      )}
    </div>
  );
}
