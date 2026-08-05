import { createClient } from "@/lib/supabase/server";
import { REPORT_DATA_SOURCES, type ReportDataSource } from "@/lib/analytics-reports";
import { DataSourcesView } from "@/components/analytics/data-sources-view";

export default async function AnalyticsDataPage() {
  const supabase = await createClient();
  const sources = Object.keys(REPORT_DATA_SOURCES) as ReportDataSource[];
  const counts = await Promise.all(
    sources.map(async (key) => {
      const { count } = await supabase.from(REPORT_DATA_SOURCES[key].table).select("id", { count: "exact", head: true });
      return { key, count: count ?? 0 };
    })
  );

  return <DataSourcesView counts={counts} />;
}
