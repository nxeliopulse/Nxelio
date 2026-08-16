import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { RepLeaderboardRow } from "@/lib/queries/analytics-team";

export function RepLeaderboardTable({ rows }: { rows: RepLeaderboardRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Rep Leaderboard</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>User</DataTableTh>
            <DataTableTh className="text-right">Prospects</DataTableTh>
            <DataTableTh className="text-right">Outreach</DataTableTh>
            <DataTableTh className="text-right">Replies</DataTableTh>
            <DataTableTh className="text-right">Meetings</DataTableTh>
            <DataTableTh className="text-right">Qualified</DataTableTh>
            <DataTableTh className="text-right">Opportunities</DataTableTh>
            <DataTableTh className="text-right">Pipeline</DataTableTh>
            <DataTableTh className="text-right">Revenue</DataTableTh>
            <DataTableTh className="text-right">Win Rate</DataTableTh>
            <DataTableTh className="text-right">Target</DataTableTh>
            <DataTableTh className="text-right">Attainment</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={12}>No rep activity yet.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.userId}>
              <DataTableTd className="font-semibold text-slate-900">{r.name}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.prospects)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.outreach)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.replies)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.meetings)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.qualified)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.opportunities)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.pipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(r.revenue)}</DataTableTd>
              <DataTableTd className="text-right">{r.winRate}%</DataTableTd>
              <DataTableTd className="text-right text-slate-500">{r.target != null ? formatCurrency(r.target) : "—"}</DataTableTd>
              <DataTableTd className="text-right">
                {r.attainmentPercent != null ? (
                  <span className={r.attainmentPercent >= 100 ? "font-bold text-emerald-600" : ""}>{r.attainmentPercent}%</span>
                ) : "—"}
              </DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
