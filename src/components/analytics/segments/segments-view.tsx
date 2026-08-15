import type { SegmentsAnalyticsData, SegmentsFilters } from "@/lib/queries/analytics-segments";
import { SegmentsFilterBar } from "@/components/analytics/segments/segments-filter-bar";
import { SegmentPerformanceTable } from "@/components/analytics/segments/segment-performance-table";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { KpiCard, formatNumber } from "@/components/analytics/overview/kpi-card";
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
            <KpiCard label="Total Segments" value={formatNumber(kpis.totalSegments)} href="/segments" />
            <KpiCard label="Dynamic Segments" value={formatNumber(kpis.dynamicSegments)} href="/segments" />
            <KpiCard label="Static Segments" value={formatNumber(kpis.staticSegments)} href="/segments" />
            <KpiCard label="Average Segment Size" value={formatNumber(kpis.averageSegmentSize)} href="/segments" />
            <KpiCard label="Active Campaigns Using Segments" value={formatNumber(kpis.activeCampaignsUsingSegments)} href="/campaigns" />
          </div>

          <RevenueFunnel stages={data.funnel} title="Segment Funnel" />

          <SegmentPerformanceTable rows={data.performance} />
        </>
      )}
    </div>
  );
}
