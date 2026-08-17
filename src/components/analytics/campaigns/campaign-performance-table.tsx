"use client";
import { useState } from "react";
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

const RANK_OPTIONS: { value: keyof CampaignPerformanceRow; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "pipeline", label: "Pipeline" },
  { value: "replyRate", label: "Reply Rate" },
  { value: "meetings", label: "Meetings" },
  { value: "opportunities", label: "Opportunities" },
];

/** Campaign Performance table — server pre-sorts by revenue, the Rank By
 *  selector re-sorts the already-fetched rows client-side. */
export function CampaignPerformanceTable({ rows }: { rows: CampaignPerformanceRow[] }) {
  const [rankBy, setRankBy] = useState<keyof CampaignPerformanceRow>("revenue");
  const sorted = [...rows].sort((a, b) => Number(b[rankBy]) - Number(a[rankBy]));

  return (
    <Card>
      <CardHeader className="pb-0 border-0 flex-row items-center justify-between">
        <CardTitle className="text-sm">Campaign Performance</CardTitle>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          value={rankBy}
          onChange={(e) => setRankBy(e.target.value as keyof CampaignPerformanceRow)}
        >
          {RANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>Rank by {o.label}</option>)}
        </select>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Campaign</DataTableTh>
            <DataTableTh>Segment</DataTableTh>
            <DataTableTh className="text-right">Enrolled</DataTableTh>
            <DataTableTh className="text-right">Sent</DataTableTh>
            <DataTableTh className="text-right">Delivery Rate</DataTableTh>
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
          {sorted.length === 0 && <DataTableEmpty colSpan={14}>No campaigns exist yet.</DataTableEmpty>}
          {sorted.map((c) => (
            <DataTableRow key={c.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>
              </DataTableTd>
              <DataTableTd>{c.segment || "—"}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.enrolled)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.sent)}</DataTableTd>
              <DataTableTd className="text-right">{c.deliveryRate}%</DataTableTd>
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
