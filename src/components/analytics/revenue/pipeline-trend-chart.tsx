import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChartWidget } from "@/components/analytics/widgets/AreaChartWidget";
import type { PipelineTrendPoint } from "@/lib/queries/analytics-revenue";

/** Pipeline Trend — real open-pipeline history from daily snapshots
 *  (migration 0129), not a live-only number. Total value as the primary
 *  area, weighted value as the dashed overlay. Empty until the cron has
 *  recorded at least one day. */
export function PipelineTrendChart({ points }: { points: PipelineTrendPoint[] }) {
  const data = points.map((p) => ({
    label: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Math.round(p.totalPipelineValue),
    value2: Math.round(p.weightedPipelineValue),
  }));
  return (
    <Card className="h-full">
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Pipeline Trend</CardTitle>
      </CardHeader>
      {data.length > 0 ? (
        <AreaChartWidget config={{ chartType: "area", title: "Open Pipeline Value", unit: "currency" }} data={data} />
      ) : (
        <p className="px-4 py-8 text-center text-xs text-slate-400 italic">
          No pipeline history yet — this builds up once the daily snapshot cron has run.
        </p>
      )}
    </Card>
  );
}
