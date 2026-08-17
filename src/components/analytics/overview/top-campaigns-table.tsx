"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { TopCampaignRow } from "@/lib/queries/analytics-overview";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";

const RANK_OPTIONS: { value: keyof TopCampaignRow; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "pipeline", label: "Pipeline" },
  { value: "meetings", label: "Meetings" },
  { value: "replies", label: "Replies" },
  { value: "qualified", label: "Qualified" },
];

/** Top Performing Campaigns (doc §10) — the server sends every metric
 *  already computed (buildTopCampaigns in analytics-overview.ts), so the
 *  "Rank By" selector re-sorts the existing rows client-side rather than
 *  refetching. */
export function TopCampaignsTable({ campaigns }: { campaigns: TopCampaignRow[] }) {
  const [rankBy, setRankBy] = useState<keyof TopCampaignRow>("revenue");
  const sorted = [...campaigns].sort((a, b) => Number(b[rankBy]) - Number(a[rankBy]));
  return (
    <Card>
      <CardHeader className="border-0 pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm">Top Performing Campaigns</CardTitle>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          value={rankBy}
          onChange={(e) => setRankBy(e.target.value as keyof TopCampaignRow)}
        >
          {RANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>Rank by {o.label}</option>)}
        </select>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Campaign</DataTableTh>
            <DataTableTh className="text-right">Replies</DataTableTh>
            <DataTableTh className="text-right">Meetings</DataTableTh>
            <DataTableTh className="text-right">Qualified</DataTableTh>
            <DataTableTh className="text-right">Opportunities</DataTableTh>
            <DataTableTh className="text-right">Pipeline</DataTableTh>
            <DataTableTh className="text-right">Closed-Won Revenue</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sorted.length === 0 && <DataTableEmpty colSpan={7}>No campaign activity exists for the selected period.</DataTableEmpty>}
          {sorted.map((c) => (
            <DataTableRow key={c.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.name}</Link>
              </DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.replies)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.meetings)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.qualified)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(c.opportunities)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(c.pipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(c.revenue)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
