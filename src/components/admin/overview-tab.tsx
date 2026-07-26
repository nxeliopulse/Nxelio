import { Users, DollarSign, TrendingUp, Flame } from "lucide-react";
import type { PlatformOverviewStats, HotCustomerRow } from "@/lib/queries/platform-overview";

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
          <div key={c.label} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-[#18A7B8]/40 hover:shadow-md transition-all">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.color} mb-3`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{c.value}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500 fill-amber-500/20" /> Hot Customers
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ranked by activity &mdash; leads imported + campaigns sent + AI credits consumed.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
              <tr className="text-left">
                <th className="px-5 py-3.5 font-bold">Workspace</th>
                <th className="px-5 py-3.5 font-bold">Plan</th>
                <th className="px-5 py-3.5 font-bold text-right">Leads</th>
                <th className="px-5 py-3.5 font-bold text-right">Campaigns Sent</th>
                <th className="px-5 py-3.5 font-bold text-right">Credits Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {hotCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 font-medium">
                    No activity yet.
                  </td>
                </tr>
              )}
              {hotCustomers.map((c) => (
                <tr key={c.workspace_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{c.workspace_name}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 font-medium">{c.plan_name}</td>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 text-right tabular-nums font-bold">{c.leadCount}</td>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 text-right tabular-nums font-bold">{c.campaignsSent}</td>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 text-right tabular-nums font-bold">{c.creditsConsumed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

