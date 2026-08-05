import { listFolders } from "@/lib/queries/analytics-folders";
import { listDashboards } from "@/lib/queries/analytics-dashboards";
import { listReports } from "@/lib/queries/analytics-reports";
import { AnalyticsShell } from "@/components/analytics/analytics-shell";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const [dashboardFolders, reportFolders, dashboards, reports] = await Promise.all([
    listFolders("dashboard"),
    listFolders("report"),
    listDashboards(),
    listReports(),
  ]);

  return (
    <AnalyticsShell dashboardFolders={dashboardFolders} reportFolders={reportFolders} dashboards={dashboards} reports={reports}>
      {children}
    </AnalyticsShell>
  );
}
