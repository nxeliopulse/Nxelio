import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatNumber } from "@/components/analytics/overview/kpi-card";
import type { FeatureUsageRow } from "@/lib/queries/analytics-ai-performance";

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FeatureUsageTable({ rows }: { rows: FeatureUsageRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">AI Feature Usage & Credits</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr><DataTableTh>Feature</DataTableTh><DataTableTh className="text-right">Uses</DataTableTh><DataTableTh className="text-right">Credits</DataTableTh></tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={3}>No AI feature usage recorded yet.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.feature}>
              <DataTableTd className="font-medium">{humanize(r.feature)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.uses)}</DataTableTd>
              <DataTableTd className="text-right font-bold">{formatNumber(r.credits)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
