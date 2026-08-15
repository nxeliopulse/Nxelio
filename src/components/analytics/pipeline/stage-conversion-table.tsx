import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import type { StageConversionRow } from "@/lib/queries/analytics-pipeline";

/** Stage Conversion (doc §13) — approximated as "reached this stage or
 *  later" since there's no opportunity_stage_history table to reconstruct
 *  true stage-to-stage transitions (see analytics-pipeline.ts for detail). */
export function StageConversionTable({ rows }: { rows: StageConversionRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Stage Conversion</CardTitle>
        <p className="text-xs text-slate-400 mt-0.5">Approximated from current stage distribution — no stage-history log exists yet</p>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Transition</DataTableTh>
            <DataTableTh className="text-right">Conversion %</DataTableTh>
            <DataTableTh className="text-right">Drop-off %</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r, i) => (
            <DataTableRow key={i}>
              <DataTableTd className="font-medium">{r.from} → {r.to}</DataTableTd>
              <DataTableTd className="text-right font-bold text-emerald-600">{r.conversionPercent}%</DataTableTd>
              <DataTableTd className="text-right text-rose-500">{r.dropOffPercent}%</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
