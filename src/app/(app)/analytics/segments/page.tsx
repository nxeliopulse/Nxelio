import { getSegmentsAnalytics, type SegmentsFilters } from "@/lib/queries/analytics-segments";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { SegmentsView } from "@/components/analytics/segments/segments-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

export default async function AnalyticsSegmentsPage({ searchParams }: { searchParams: Promise<{ range?: string; type?: string; status?: string }> }) {
  const sp = await searchParams;
  const filters: SegmentsFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    segmentType: sp.type,
    status: sp.status,
  };
  const data = await getSegmentsAnalytics(filters);
  return <SegmentsView data={data} filters={filters} />;
}
