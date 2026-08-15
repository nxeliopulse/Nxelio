import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { AccountsAnalyticsData } from "@/lib/queries/analytics-accounts";

function TopAccountsTable({ title, rows, valueLabel }: { title: string; rows: { id: string; name: string; value: number }[]; valueLabel: string }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr><DataTableTh>Account</DataTableTh><DataTableTh className="text-right">{valueLabel}</DataTableTh></tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={2}>No data yet.</DataTableEmpty>}
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <DataTableTd className="font-medium"><Link href={`/accounts/${r.id}`} className="hover:underline">{r.name}</Link></DataTableTd>
              <DataTableTd className="text-right font-bold">{formatCurrency(r.value)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}

export function AccountReports({ data }: { data: AccountsAnalyticsData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Accounts by Industry</CardTitle></CardHeader>
          <BarChartWidget config={{ chartType: "bar", title: "Accounts by Industry" }} data={data.byIndustry.map((r) => ({ label: r.label, value: r.count }))} />
        </Card>
        <Card>
          <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Accounts by Size</CardTitle></CardHeader>
          <BarChartWidget config={{ chartType: "bar", title: "Accounts by Size" }} data={data.bySize.map((r) => ({ label: r.label, value: r.count }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopAccountsTable title="Accounts by Pipeline Value" rows={data.byPipelineValue} valueLabel="Open Pipeline" />
        <TopAccountsTable title="Accounts by Revenue" rows={data.byRevenue} valueLabel="Won Revenue" />
      </div>

      <Card>
        <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Top Engaged Accounts</CardTitle></CardHeader>
        <DataTable>
          <DataTableHead><tr><DataTableTh>Account</DataTableTh><DataTableTh className="text-right">Engagement Score</DataTableTh></tr></DataTableHead>
          <DataTableBody>
            {data.topEngaged.length === 0 && <DataTableEmpty colSpan={2}>No data yet.</DataTableEmpty>}
            {data.topEngaged.map((r) => (
              <DataTableRow key={r.id}>
                <DataTableTd className="font-medium"><Link href={`/accounts/${r.id}`} className="hover:underline">{r.name}</Link></DataTableTd>
                <DataTableTd className="text-right font-bold">{r.score}</DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </Card>

      <Card>
        <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Accounts with Stalled Opportunities</CardTitle></CardHeader>
        <DataTable>
          <DataTableHead><tr><DataTableTh>Account</DataTableTh><DataTableTh className="text-right">Open Deals</DataTableTh><DataTableTh className="text-right">Days Stalled</DataTableTh></tr></DataTableHead>
          <DataTableBody>
            {data.stalledAccounts.length === 0 && <DataTableEmpty colSpan={3}>No stalled accounts — nice work.</DataTableEmpty>}
            {data.stalledAccounts.map((r) => (
              <DataTableRow key={r.accountId}>
                <DataTableTd className="font-medium"><Link href={`/accounts/${r.accountId}`} className="hover:underline">{r.accountName}</Link></DataTableTd>
                <DataTableTd className="text-right">{formatNumber(r.opportunityCount)}</DataTableTd>
                <DataTableTd className="text-right font-bold text-rose-600">{r.daysStalled}d</DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </Card>
    </div>
  );
}
