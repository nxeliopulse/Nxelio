import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency } from "@/components/analytics/overview/kpi-card";
import type { StalledOpportunityRow } from "@/lib/queries/analytics-pipeline";

export function StalledTable({ rows, ownerNames }: { rows: StalledOpportunityRow[]; ownerNames: Record<string, string> }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Stalled Opportunities (14+ days no activity)</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Opportunity</DataTableTh>
            <DataTableTh>Account</DataTableTh>
            <DataTableTh>Stage</DataTableTh>
            <DataTableTh className="text-right">Value</DataTableTh>
            <DataTableTh className="text-right">Days Stalled</DataTableTh>
            <DataTableTh>Owner</DataTableTh>
            <DataTableTh>Recommended Action</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={7}>No stalled opportunities — nice work.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href={`/opportunities/${r.id}`} className="hover:underline">{r.name}</Link>
              </DataTableTd>
              <DataTableTd>{r.account || "—"}</DataTableTd>
              <DataTableTd>{r.stage}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.value)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-rose-600">{r.daysStalled}d</DataTableTd>
              <DataTableTd>{r.ownerId ? ownerNames[r.ownerId] || "—" : "—"}</DataTableTd>
              <DataTableTd className="text-slate-500">Follow up with a call or email</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
