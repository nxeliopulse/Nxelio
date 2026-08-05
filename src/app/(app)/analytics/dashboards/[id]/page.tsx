import { notFound } from "next/navigation";
import { getDashboardWithWidgets } from "@/lib/queries/analytics-dashboards";
import { getReport } from "@/lib/queries/analytics-reports";
import { fetchChartData } from "@/lib/queries/analytics-chart-data";
import { getAnalyticsStats } from "@/lib/queries/analytics";
import { getDashboardStats } from "@/lib/queries/analytics";
import { getSystemWidgetData } from "@/lib/analytics-system-widgets";
import { DashboardOpenView, type ResolvedWidget } from "@/components/analytics/dashboard-open-view";

export default async function DashboardOpenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dashboard = await getDashboardWithWidgets(id);
  if (!dashboard) notFound();

  const [reports, stats, dashboardStats] = await Promise.all([
    Promise.all(dashboard.widgets.map((w) => getReport(w.reportId))),
    getAnalyticsStats(),
    getDashboardStats(),
  ]);

  const maybeWidgets: (ResolvedWidget | null)[] = await Promise.all(
    dashboard.widgets.map(async (widget, i): Promise<ResolvedWidget | null> => {
      const report = reports[i];
      if (!report) return null;
      if (report.systemKey) {
        return { widget, report, systemData: getSystemWidgetData(report.systemKey, stats, dashboardStats) };
      }
      const chartData = await fetchChartData(report);
      return { widget, report, chartData };
    })
  );
  const resolvedWidgets = maybeWidgets.filter((r): r is ResolvedWidget => r !== null);

  return <DashboardOpenView dashboard={dashboard} resolvedWidgets={resolvedWidgets} />;
}
