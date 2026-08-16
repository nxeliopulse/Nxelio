import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import { formatNumber } from "@/components/analytics/overview/kpi-card";
import type { ChannelRow } from "@/lib/queries/analytics-engagement";

export function ChannelPerformanceTable({ rows }: { rows: ChannelRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Engagement by Channel</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Channel</DataTableTh>
            <DataTableTh className="text-right">Attempts</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meetings</DataTableTh>
            <DataTableTh className="text-right">Opportunity Conversion</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.channel}>
              <DataTableTd className="font-semibold">{r.channel}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.attempts)}</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.meetings)}</DataTableTd>
              <DataTableTd className="text-right">{r.opportunityConversion}%</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
