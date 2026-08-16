import { listDashboards } from "@/lib/queries/analytics-dashboards";
import { listReports } from "@/lib/queries/analytics-reports";
import { AnalyticsShell } from "@/components/analytics/analytics-shell";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const [dashboards, reports] = await Promise.all([
    listDashboards(),
    listReports(),
  ]);

  return (
    <AnalyticsShell dashboards={dashboards} reports={reports}>
      {children}
    </AnalyticsShell>
  );
}
