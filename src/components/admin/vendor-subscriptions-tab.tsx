"use client";
import { useState, useTransition } from "react";
import { Check, Pencil, Loader2 } from "lucide-react";
import { updateVendorSubscription, type VendorSubscriptionRow } from "@/lib/queries/platform-vendor-subscriptions";

function centsToDollarsStr(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}

export function VendorSubscriptionsTab({ rows }: { rows: VendorSubscriptionRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
        <h3 className="font-bold text-slate-900 dark:text-white text-base">Our Vendor Subscriptions</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Nxelio&apos;s own paid accounts (Unipile, AnySite, Brevo, Bright Data). Tracked manually &mdash; these vendors don&apos;t expose a billing API we integrate with.
        </p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {rows.map((r) => <VendorRow key={r.id} row={r} />)}
      </div>
    </div>
  );
}

function VendorRow({ row }: { row: VendorSubscriptionRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [planName, setPlanName] = useState(row.plan_name ?? "");
  const [cost, setCost] = useState(centsToDollarsStr(row.monthly_cost_cents));
  const [renewal, setRenewal] = useState(row.renewal_date ?? "");
  const [notes, setNotes] = useState(row.usage_notes ?? "");

  function save() {
    startTransition(async () => {
      await updateVendorSubscription(row.id, {
        plan_name: planName.trim() || null,
        monthly_cost_cents: cost.trim() ? Math.round(parseFloat(cost) * 100) : null,
        renewal_date: renewal || null,
        usage_notes: notes.trim() || null,
      });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="p-5 flex items-start justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
        <div>
          <p className="font-bold text-slate-900 dark:text-white text-base">{row.vendor_name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mt-0.5">
            {row.plan_name || "No plan set"}
            {row.monthly_cost_cents != null && ` · $${(row.monthly_cost_cents / 100).toFixed(2)}/mo`}
            {row.renewal_date && ` · renews ${new Date(row.renewal_date).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
          </p>
          {row.usage_notes && <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{row.usage_notes}</p>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-all"
        >
          <Pencil className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-200/80 dark:border-slate-800 last:border-0">
      <p className="font-bold text-slate-900 dark:text-white text-base">{row.vendor_name}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Plan name</label>
          <input
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="e.g. Pro"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#18A7B8] focus:ring-2 focus:ring-[#18A7B8]/20 transition-all shadow-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Monthly cost (USD)</label>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="e.g. 55"
            type="number"
            step="0.01"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#18A7B8] focus:ring-2 focus:ring-[#18A7B8]/20 transition-all shadow-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Renewal date</label>
          <input
            value={renewal}
            onChange={(e) => setRenewal(e.target.value)}
            type="date"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#18A7B8] focus:ring-2 focus:ring-[#18A7B8]/20 transition-all shadow-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Usage notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 4,200 / 10,000 emails sent"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#18A7B8] focus:ring-2 focus:ring-[#18A7B8]/20 transition-all shadow-sm"
          />
        </div>
      </div>
      <div className="flex gap-2.5 pt-1">
        <button
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#18A7B8] hover:bg-[#14929f] text-white px-4 py-2 text-xs font-bold shadow-sm transition-all disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={pending}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
