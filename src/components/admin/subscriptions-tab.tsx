import type { SubscriptionRow } from "@/lib/queries/platform-overview";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-950 text-emerald-300",
  trialing: "bg-amber-950 text-amber-300",
  past_due: "bg-red-950 text-red-300",
  canceled: "bg-slate-800 text-slate-400",
};

export function SubscriptionsTab({ rows }: { rows: SubscriptionRow[] }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="font-semibold text-white">Customer Subscriptions</h3>
        <p className="text-xs text-slate-400 mt-0.5">View-only — billed and managed via Stripe.</p>
      </div>
      <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-slate-950/50 sticky top-0 z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Workspace</th>
              <th className="px-4 py-2.5 font-semibold">Plan</th>
              <th className="px-4 py-2.5 font-semibold">Billing</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Credits</th>
              <th className="px-4 py-2.5 font-semibold">Renews</th>
              <th className="px-4 py-2.5 font-semibold">Stripe ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No subscriptions yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.workspace_id} className="hover:bg-slate-900/50">
                <td className="px-4 py-2.5 text-white">{r.workspace_name}</td>
                <td className="px-4 py-2.5 text-slate-300">{r.plan_name}</td>
                <td className="px-4 py-2.5 text-slate-400 capitalize">{r.billing_interval}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[r.status] || "bg-slate-800 text-slate-400"}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-400 tabular-nums">{r.credits_remaining} / {r.credits_total}</td>
                <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(r.current_period_end)}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.stripe_customer_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
