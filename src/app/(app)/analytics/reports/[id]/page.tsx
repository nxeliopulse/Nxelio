import { notFound } from "next/navigation";
import { getReport } from "@/lib/queries/analytics-reports";
import { fetchChartData } from "@/lib/queries/analytics-chart-data";
import { getAnalyticsStats, getDashboardStats } from "@/lib/queries/analytics";
import { getSystemWidgetData } from "@/lib/analytics-system-widgets";
import { ReportOpenView } from "@/components/analytics/report-open-view";

export default async function ReportOpenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  if (report.systemKey) {
    const [stats, dashboardStats] = await Promise.all([getAnalyticsStats(), getDashboardStats()]);
    const systemData = getSystemWidgetData(report.systemKey, stats, dashboardStats);
    return <ReportOpenView report={report} systemData={systemData} />;
  }

  const chartData = await fetchChartData(report);
  return <ReportOpenView report={report} chartData={chartData} />;
}
