import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { TopCampaignRow } from "@/lib/queries/analytics-overview";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";

/** Top Performing Campaigns (doc §10) — sorted by revenue descending
 *  server-side (see buildTopCampaigns in analytics-overview.ts). */
export function TopCampaignsTable({ campaigns }: { campaigns: TopCampaignRow[] }) {
  return (
    <Card>
      <CardHeader className="border-0 pb-0">
        <CardTitle className="text-sm">Top Performing Campaigns</CardTitle>
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
          {campaigns.length === 0 && <DataTableEmpty colSpan={7}>No campaign activity exists for the selected period.</DataTableEmpty>}
          {campaigns.map((c) => (
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
