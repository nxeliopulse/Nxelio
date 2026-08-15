import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { CampaignPerformanceRow } from "@/lib/queries/analytics-campaigns";

const STATUS_STYLE: Record<string, string> = {
  Active: "text-emerald-600 bg-emerald-50",
  Paused: "text-amber-600 bg-amber-50",
  Completed: "text-slate-500 bg-slate-100",
  Draft: "text-slate-400 bg-slate-50",
};

export function CampaignPerformanceTable({ rows }: { rows: CampaignPerformanceRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Campaign Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Campaign</DataTableTh>
            <DataTableTh>Segment</DataTableTh>
            <DataTableTh className="text-right">Sent</DataTableTh>
            <DataTableTh className="text-right">Delivered</DataTableTh>
            <DataTableTh className="text-right">Open Rate</DataTableTh>
            <DataTableTh className="text-right">Click Rate</DataTableTh>
            <DataTableTh className="text-right">Reply Rate</DataTableTh>
            <DataTableTh className="text-right">Meetings</DataTableTh>
            <DataTableTh className="text-right">Qualified</DataTableTh>
            <DataTableTh className="text-right">Opportunities</DataTableTh>
            <DataTableTh className="text-right">Pipeline</DataTableTh>
            <DataTableTh className="text-right">Revenue</DataTableTh>
            <DataTableTh>Status</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={13}>No campaigns exist yet.</DataTableEmpty>}
          {rows.map((c) => (
            <DataTableRow key={c.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>
              </DataTableTd>
              <DataTableTd>{c.segment || "—"}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.sent)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.delivered)}</DataTableTd>
              <DataTableTd className="text-right">{c.openRate}%</DataTableTd>
              <DataTableTd className="text-right">{c.clickRate}%</DataTableTd>
              <DataTableTd className="text-right">{c.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.meetings)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.qualified)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.opportunities)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(c.pipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(c.revenue)}</DataTableTd>
              <DataTableTd><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[c.status] || "text-slate-500 bg-slate-50"}`}>{c.status}</span></DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
