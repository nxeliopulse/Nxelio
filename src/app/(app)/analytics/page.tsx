import { getAnalyticsStats } from "@/lib/queries/analytics";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export default async function AnalyticsPage() {
  const stats = await getAnalyticsStats();
  return <AnalyticsView stats={stats} />;
}
