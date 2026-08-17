import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { StageDetailRow } from "@/lib/queries/analytics-pipeline";

export function StageDetailTable({ rows }: { rows: StageDetailRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Pipeline by Stage</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Stage</DataTableTh>
            <DataTableTh className="text-right">Deals</DataTableTh>
            <DataTableTh className="text-right">Total Amount</DataTableTh>
            <DataTableTh className="text-right">% of Pipeline</DataTableTh>
            <DataTableTh className="text-right">Average Amount</DataTableTh>
            <DataTableTh className="text-right">Weighted Value</DataTableTh>
            <DataTableTh className="text-right">Average Age</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.stage}>
              <DataTableTd className="font-semibold">{r.label}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.count)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.totalAmount)}</DataTableTd>
              <DataTableTd className="text-right">{r.percentOfPipeline}%</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.averageAmount)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.weightedValue)}</DataTableTd>
              <DataTableTd className="text-right">{r.averageAgeDays}d</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
