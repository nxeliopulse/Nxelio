import { getAiPerformanceAnalytics } from "@/lib/queries/analytics-ai-performance";
import { AiPerformanceView } from "@/components/analytics/ai-performance/ai-performance-view";

export default async function AnalyticsAiPerformancePage() {
  const data = await getAiPerformanceAnalytics();
  return <AiPerformanceView data={data} />;
}
