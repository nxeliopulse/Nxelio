import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import type { ScoreBandOutcomeRow } from "@/lib/queries/analytics-ai-performance";

/** AI Score Performance by band (doc §7/§54) — answers "does a high Nxelio
 *  AI Score actually predict better outcomes." */
export function ScoreBandOutcomesTable({ rows }: { rows: ScoreBandOutcomeRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">AI Score Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Score Band</DataTableTh>
            <DataTableTh className="text-right">Prospects</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meeting Rate</DataTableTh>
            <DataTableTh className="text-right">Opportunity Rate</DataTableTh>
            <DataTableTh className="text-right">Win Rate</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.label}>
              <DataTableTd className="font-semibold">{r.min}–{r.max} ({r.label})</DataTableTd>
              <DataTableTd className="text-right">{r.count}</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.meetingRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.opportunityRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.winRate}%</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
