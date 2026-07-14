import { Users, DollarSign, TrendingUp, Flame } from "lucide-react";
import type { PlatformOverviewStats, HotCustomerRow } from "@/lib/queries/platform-overview";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function OverviewTab({ stats, hotCustomers }: { stats: PlatformOverviewStats; hotCustomers: HotCustomerRow[] }) {
  const cards = [
    { label: "Total Customers", value: stats.totalCustomers.toLocaleString(), icon: Users, color: "text-blue-400 bg-blue-950" },
    { label: "Active Subscriptions", value: stats.activeSubscriptions.toLocaleString(), icon: TrendingUp, color: "text-emerald-400 bg-emerald-950" },
    { label: "Trialing", value: stats.trialingSubscriptions.toLocaleString(), icon: TrendingUp, color: "text-amber-400 bg-amber-950" },
    { label: "MRR", value: money(stats.mrrCents), icon: DollarSign, color: "text-purple-400 bg-purple-950" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color} mb-3`}>
              <c.icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="font-semibold text-white flex items-center gap-2"><Flame className="h-4 w-4 text-orange-400" /> Hot Customers</h3>
          <p className="text-xs text-slate-400 mt-0.5">Ranked by activity — leads imported + campaigns sent + AI credits consumed.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-950/50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Workspace</th>
              <th className="px-4 py-2.5 font-semibold">Plan</th>
              <th className="px-4 py-2.5 font-semibold text-right">Leads</th>
              <th className="px-4 py-2.5 font-semibold text-right">Campaigns Sent</th>
              <th className="px-4 py-2.5 font-semibold text-right">Credits Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {hotCustomers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No activity yet.</td></tr>
            )}
            {hotCustomers.map((c) => (
              <tr key={c.workspace_id} className="hover:bg-slate-900/50">
                <td className="px-4 py-2.5 text-white">{c.workspace_name}</td>
                <td className="px-4 py-2.5 text-slate-400">{c.plan_name}</td>
                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{c.leadCount}</td>
                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{c.campaignsSent}</td>
                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{c.creditsConsumed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
