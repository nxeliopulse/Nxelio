import type { SubscriptionRow } from "@/lib/queries/platform-overview";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold",
  trialing: "bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold",
  past_due: "bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold",
  canceled: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-semibold",
};

export function SubscriptionsTab({ rows }: { rows: SubscriptionRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
        <h3 className="font-bold text-slate-900 dark:text-white text-base">Customer Subscriptions</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">View-only &mdash; billed and managed via Stripe.</p>
      </div>
      <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200/80 dark:border-slate-800">
            <tr className="text-left">
              <th className="px-5 py-3.5 font-bold">Workspace</th>
              <th className="px-5 py-3.5 font-bold">Plan</th>
              <th className="px-5 py-3.5 font-bold">Billing</th>
              <th className="px-5 py-3.5 font-bold">Status</th>
              <th className="px-5 py-3.5 font-bold">Credits</th>
              <th className="px-5 py-3.5 font-bold">Renews</th>
              <th className="px-5 py-3.5 font-bold">Stripe ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 font-medium">
                  No subscriptions yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.workspace_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{r.workspace_name}</td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 font-medium">{r.plan_name}</td>
                <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 capitalize">{r.billing_interval}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs capitalize ${STATUS_STYLE[r.status] || "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-semibold tabular-nums">{r.credits_remaining} / {r.credits_total}</td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(r.current_period_end)}</td>
                <td className="px-5 py-3.5 text-slate-400 dark:text-slate-500 font-mono text-xs">{r.stripe_customer_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

