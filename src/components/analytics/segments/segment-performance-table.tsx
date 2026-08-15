import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { SegmentPerformanceRow } from "@/lib/queries/analytics-segments";

/** Segment Performance Table (doc §8) — sorted by revenue descending
 *  server-side. Sortable-by-column comparison across all segments serves
 *  as this phase's "compare 2-5 audiences" — a dedicated multi-select
 *  comparison widget is deferred to a later pass. */
export function SegmentPerformanceTable({ rows }: { rows: SegmentPerformanceRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Segment Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Segment</DataTableTh>
            <DataTableTh>Type</DataTableTh>
            <DataTableTh className="text-right">Matching</DataTableTh>
            <DataTableTh className="text-right">Eligible</DataTableTh>
            <DataTableTh className="text-right">Campaigns</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meeting Rate</DataTableTh>
            <DataTableTh className="text-right">Qualification Rate</DataTableTh>
            <DataTableTh className="text-right">Opportunities</DataTableTh>
            <DataTableTh className="text-right">Pipeline</DataTableTh>
            <DataTableTh className="text-right">Revenue</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={11}>No segments exist yet.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href="/segments" className="hover:underline">{r.name}</Link>
              </DataTableTd>
              <DataTableTd>{r.type}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.matchingProspects)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.eligibleProspects)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.campaigns)}</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.meetingRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.qualificationRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.opportunities)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.pipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(r.revenue)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
