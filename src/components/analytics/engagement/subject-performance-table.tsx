import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatNumber } from "@/components/analytics/overview/kpi-card";
import type { SubjectRow } from "@/lib/queries/analytics-engagement";

/** Subject Line Performance (doc §9) — one row per campaign's fixed subject
 *  line, since this schema tracks one subject per campaign rather than
 *  per-message subject variants. */
export function SubjectPerformanceTable({ rows }: { rows: SubjectRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Subject Line Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Subject</DataTableTh>
            <DataTableTh className="text-right">Sent</DataTableTh>
            <DataTableTh className="text-right">Open Rate</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meetings Generated</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={5}>No sends in the selected period.</DataTableEmpty>}
          {rows.map((r, i) => (
            <DataTableRow key={i}>
              <DataTableTd className="font-medium max-w-xs truncate">{r.subject}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.sent)}</DataTableTd>
              <DataTableTd className="text-right">{r.openRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.meetingsGenerated)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
