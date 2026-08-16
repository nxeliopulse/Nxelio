import { notFound } from "next/navigation";
import { getDashboardWithWidgets } from "@/lib/queries/analytics-dashboards";
import { getReport } from "@/lib/queries/analytics-reports";
import { fetchChartData } from "@/lib/queries/analytics-chart-data";
import { getAnalyticsStats } from "@/lib/queries/analytics";
import { getDashboardStats } from "@/lib/queries/analytics";
import { getSystemWidgetData } from "@/lib/analytics-system-widgets";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { resolveDateRangePreset, type DateRangePreset } from "@/lib/analytics/overview-metrics";
import { DashboardOpenView, type ResolvedWidget } from "@/components/analytics/dashboard-open-view";
import type { ReportDefinition } from "@/lib/analytics-reports";

/** Applies the dashboard's global date-range filter (if set) to a report
 *  before execution — every report data source has a filterable `created_at`
 *  field (see REPORT_DATA_SOURCES), so this works generically across chart
 *  types without per-report configuration. System-key panels bypass the
 *  generic report engine entirely and are left untouched. */
function withGlobalDateFilter(report: ReportDefinition, globalFilters: { dateRange?: string; customFrom?: string; customTo?: string }): ReportDefinition {
  if (report.systemKey || !globalFilters.dateRange) return report;
  const now = new Date();
  const range = globalFilters.dateRange === "custom" && globalFilters.customFrom && globalFilters.customTo
    ? { from: new Date(globalFilters.customFrom), to: new Date(globalFilters.customTo) }
    : resolveDateRangePreset(globalFilters.dateRange as Exclude<DateRangePreset, "custom">, now);
  return {
    ...report,
    filters: [
      ...report.filters.filter((f) => f.field !== "created_at"),
      { field: "created_at", operator: "date_range", value: { start: range.from.toISOString(), end: range.to.toISOString() } },
    ],
  };
}

export default async function DashboardOpenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dashboard = await getDashboardWithWidgets(id);
  if (!dashboard) notFound();

  const [reports, stats, dashboardStats, ctx] = await Promise.all([
    Promise.all(dashboard.widgets.map((w) => getReport(w.reportId))),
    getAnalyticsStats(),
    getDashboardStats(),
    getAnalyticsContext(),
  ]);

  const maybeWidgets: (ResolvedWidget | null)[] = await Promise.all(
    dashboard.widgets.map(async (widget, i): Promise<ResolvedWidget | null> => {
      const report = reports[i];
      if (!report) return null;
      if (report.systemKey) {
        return { widget, report, systemData: getSystemWidgetData(report.systemKey, stats, dashboardStats) };
      }
      const chartData = await fetchChartData(withGlobalDateFilter(report, dashboard.globalFilters));
      return { widget, report, chartData };
    })
  );
  const resolvedWidgets = maybeWidgets.filter((r): r is ResolvedWidget => r !== null);

  return <DashboardOpenView dashboard={dashboard} resolvedWidgets={resolvedWidgets} currentUserId={ctx.userId} />;
}
