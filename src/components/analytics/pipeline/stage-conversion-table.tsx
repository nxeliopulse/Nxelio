import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import type { StageConversionRow } from "@/lib/queries/analytics-pipeline";

/** Stage Conversion (doc §13) — real from→to transitions, computed from
 *  opportunity_stage_history (migration 0127). Each row's first-arrival
 *  timestamp per stage is compared to the next stage's first-arrival to get
 *  a genuine conversion % and average days-in-stage. */
export function StageConversionTable({ rows }: { rows: StageConversionRow[] }) {
  const basedOnRealHistory = rows.some((r) => r.basedOnRealHistory);
  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Stage Conversion</CardTitle>
        <p className="text-xs text-slate-400 mt-0.5">
          {basedOnRealHistory
            ? "Based on real stage-move history"
            : "No stage moves recorded yet — figures will sharpen as deals move stages"}
        </p>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Transition</DataTableTh>
            <DataTableTh className="text-right">Conversion %</DataTableTh>
            <DataTableTh className="text-right">Drop-off %</DataTableTh>
            <DataTableTh className="text-right">Avg. Days in Stage</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r, i) => (
            <DataTableRow key={i}>
              <DataTableTd className="font-medium">{r.from} → {r.to}</DataTableTd>
              <DataTableTd className="text-right font-bold text-emerald-600">{r.conversionPercent}%</DataTableTd>
              <DataTableTd className="text-right text-rose-500">{r.dropOffPercent}%</DataTableTd>
              <DataTableTd className="text-right">{r.averageDaysInStage != null ? `${r.averageDaysInStage}d` : "—"}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
