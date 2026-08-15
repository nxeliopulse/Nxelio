import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";
import { formatCurrency } from "@/components/analytics/overview/kpi-card";
import type { ForecastCategoryRow } from "@/lib/queries/analytics-revenue";

export function ForecastCategories({ rows }: { rows: ForecastCategoryRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Revenue Forecast</CardTitle></CardHeader>
      <BarChartWidget config={{ chartType: "bar", title: "Revenue Forecast", unit: "currency", color: "#0176D3" }} data={rows.map((r) => ({ label: r.category, value: Math.round(r.value) }))} />
      <div className="grid grid-cols-5 gap-2 px-4 pb-4 -mt-2">
        {rows.map((r) => (
          <div key={r.category} className="text-center">
            <p className="text-[10px] text-slate-400">{r.category}</p>
            <p className="text-xs font-bold text-slate-700">{formatCurrency(r.value)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
