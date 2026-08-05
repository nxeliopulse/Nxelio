import { listDashboards } from "@/lib/queries/analytics-dashboards";
import { listReports } from "@/lib/queries/analytics-reports";
import { ExplorerView } from "@/components/analytics/explorer-view";

export default async function AnalyticsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; folder?: string }>;
}) {
  const sp = await searchParams;
  const folderId = sp.folder === undefined ? undefined : sp.folder === "root" ? null : sp.folder;
  const type = sp.type === "dashboard" || sp.type === "report" ? sp.type : null;

  const [dashboards, reports] = await Promise.all([
    type === "report" ? Promise.resolve([]) : listDashboards(folderId),
    type === "dashboard" ? Promise.resolve([]) : listReports(folderId),
  ]);

  return <ExplorerView dashboards={dashboards} reports={reports} activeType={type} activeFolder={sp.folder ?? null} />;
}
