import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { StepAnalyticsRow } from "@/lib/queries/analytics-campaigns";

/** Sequence Step Analytics (doc §9) — reads from campaign_jobs, this app's
 *  real per-step send queue, since the standalone `sequences` table is dead
 *  schema no code in the app ever queries. Channel/Opened/Replied columns
 *  from the doc are omitted: this schema has no per-step attribution for
 *  those signals (only per-lead, not per-step), so showing them would be a
 *  fabricated number rather than a real one. */
export function StepAnalyticsTable({ rows }: { rows: StepAnalyticsRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Sequence Step Analytics</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Step</DataTableTh>
            <DataTableTh className="text-right">Sent</DataTableTh>
            <DataTableTh className="text-right">Failed</DataTableTh>
            <DataTableTh className="text-right">Skipped</DataTableTh>
            <DataTableTh className="text-right">Conversion to Next Step</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={5}>No sequence steps have run for this selection yet.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.stepOrder}>
              <DataTableTd className="font-semibold">Step {r.stepOrder}</DataTableTd>
              <DataTableTd className="text-right">{r.sent}</DataTableTd>
              <DataTableTd className="text-right">{r.failed}</DataTableTd>
              <DataTableTd className="text-right">{r.skipped}</DataTableTd>
              <DataTableTd className="text-right">{r.conversionToNextPercent > 0 ? `${r.conversionToNextPercent}%` : "—"}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
