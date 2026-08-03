import { Users, DollarSign, TrendingUp, Flame } from "lucide-react";
import type { PlatformOverviewStats, HotCustomerRow } from "@/lib/queries/platform-overview";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function OverviewTab({ stats, hotCustomers }: { stats: PlatformOverviewStats; hotCustomers: HotCustomerRow[] }) {
  const cards = [
    { label: "Total Customers", value: stats.totalCustomers.toLocaleString(), icon: Users, color: "text-[#18A7B8] dark:text-[#4dd6e5] bg-[#18A7B8]/10 dark:bg-[#18A7B8]/20 border border-[#18A7B8]/20 dark:border-[#18A7B8]/30" },
    { label: "Active Subscriptions", value: stats.activeSubscriptions.toLocaleString(), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/50" },
    { label: "Trialing", value: stats.trialingSubscriptions.toLocaleString(), icon: TrendingUp, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900/50" },
    { label: "MRR", value: money(stats.mrrCents), icon: DollarSign, color: "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900/50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 hover:border-[var(--primary)]/40 hover:shadow-md transition-all">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.color} mb-3`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{c.value}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 mt-1">{c.label}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500 fill-amber-500/20" /> Hot Customers
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Ranked by activity &mdash; prospects imported + campaigns sent + AI credits consumed.
            </p>
          </div>
        </div>
        <DataTable>
          <DataTableHead>
            <tr className="text-left">
              <DataTableTh>Workspace</DataTableTh>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh className="text-right">Prospects</DataTableTh>
              <DataTableTh className="text-right">Campaigns Sent</DataTableTh>
              <DataTableTh className="text-right">Credits Used</DataTableTh>
            </tr>
          </DataTableHead>
          <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {hotCustomers.length === 0 && (
              <DataTableEmpty colSpan={5}>No activity yet.</DataTableEmpty>
            )}
            {hotCustomers.map((c) => (
              <DataTableRow key={c.workspace_id}>
                <DataTableTd className="font-semibold text-slate-900 dark:text-white">{c.workspace_name}</DataTableTd>
                <DataTableTd className="text-slate-600 dark:text-slate-500 font-medium">{c.plan_name}</DataTableTd>
                <DataTableTd className="text-slate-900 dark:text-slate-700 text-right tabular-nums font-bold">{c.leadCount}</DataTableTd>
                <DataTableTd className="text-slate-900 dark:text-slate-700 text-right tabular-nums font-bold">{c.campaignsSent}</DataTableTd>
                <DataTableTd className="text-slate-900 dark:text-slate-700 text-right tabular-nums font-bold">{c.creditsConsumed}</DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </Card>
    </div>
  );
}

