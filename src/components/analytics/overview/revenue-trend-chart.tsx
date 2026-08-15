import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChartWidget } from "@/components/analytics/widgets/AreaChartWidget";
import type { RevenueTrendPoint } from "@/lib/queries/analytics-overview";

/** Revenue Trend (doc §9) — Closed-Won as the primary area, Weighted
 *  Forecast as the dashed overlay (AreaChartWidget's `value2` convention). */
export function RevenueTrendChart({ points }: { points: RevenueTrendPoint[] }) {
  const data = points.map((p) => ({ label: p.bucketLabel, value: Math.round(p.wonRevenue), value2: Math.round(p.weightedForecast) }));
  return (
    <Card className="h-full">
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Revenue Trend</CardTitle>
      </CardHeader>
      <AreaChartWidget config={{ chartType: "area", title: "Closed-Won Revenue", unit: "currency" }} data={data} />
    </Card>
  );
}
