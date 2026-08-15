import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { AttributionRow } from "@/lib/queries/analytics-revenue";

export function AttributionTable({ title, rows }: { title: string; rows: AttributionRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>{title.replace("Revenue by ", "")}</DataTableTh>
            <DataTableTh className="text-right">Deals</DataTableTh>
            <DataTableTh className="text-right">Open Pipeline</DataTableTh>
            <DataTableTh className="text-right">Won Revenue</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={4}>No data yet.</DataTableEmpty>}
          {rows.slice(0, 10).map((r) => (
            <DataTableRow key={r.label}>
              <DataTableTd className="font-medium">{r.label}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.dealCount)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.openPipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(r.wonRevenue)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
