import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import type { ScoreBandRow } from "@/lib/queries/analytics-prospects";

/** AI Score Distribution (doc §7) — answers "does a high AI score actually
 *  predict better engagement?" by pairing each band with its real reply/
 *  meeting rates, not just a raw count. */
export function ScoreDistributionTable({ bands }: { bands: ScoreBandRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">AI Score Distribution</CardTitle>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>AI Score</DataTableTh>
            <DataTableTh>Meaning</DataTableTh>
            <DataTableTh className="text-right">Prospects</DataTableTh>
            <DataTableTh className="text-right">% of Total</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meeting Rate</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {bands.map((b) => (
            <DataTableRow key={b.label}>
              <DataTableTd className="font-semibold">{b.min}–{b.max}</DataTableTd>
              <DataTableTd>
                <Link href={`/leads?scoreMin=${b.min}&scoreMax=${b.max}`} className="hover:underline text-slate-700">{b.label}</Link>
              </DataTableTd>
              <DataTableTd className="text-right">{b.count}</DataTableTd>
              <DataTableTd className="text-right">{b.percent}%</DataTableTd>
              <DataTableTd className="text-right">{b.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{b.meetingRate}%</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
