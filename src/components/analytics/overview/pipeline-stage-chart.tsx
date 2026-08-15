import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChartWidget } from "@/components/analytics/widgets/DonutChartWidget";
import type { PipelineStageSlice } from "@/lib/queries/analytics-overview";

/** Pipeline by Stage (doc §8) — reuses the Explorer's DonutChartWidget
 *  rather than a bespoke chart, since it already renders exactly this
 *  shape (label/value slices with legend) and links out via router. */
export function PipelineStageChart({ stages }: { stages: PipelineStageSlice[] }) {
  const data = stages.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: Math.round(s.amount) }));
  return (
    <Card className="h-full">
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Pipeline by Stage</CardTitle>
      </CardHeader>
      <DonutChartWidget config={{ chartType: "donut", title: "Pipeline by Stage", unit: "currency" }} data={data} />
    </Card>
  );
}
