import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";
import type { AgingRow } from "@/lib/queries/analytics-pipeline";

export function AgingChart({ rows }: { rows: AgingRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Opportunity Aging</CardTitle></CardHeader>
      <BarChartWidget config={{ chartType: "bar", title: "Opportunity Aging", color: "#EA580C" }} data={rows.map((r) => ({ label: r.label, value: r.count }))} />
    </Card>
  );
}
