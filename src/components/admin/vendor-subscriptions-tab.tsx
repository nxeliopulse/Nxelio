"use client";
import { useState, useTransition } from "react";
import { Check, Pencil, Loader2 } from "lucide-react";
import { updateVendorSubscription, type VendorSubscriptionRow } from "@/lib/queries/platform-vendor-subscriptions";

function centsToDollarsStr(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}

export function VendorSubscriptionsTab({ rows }: { rows: VendorSubscriptionRow[] }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="font-semibold text-white">Our Vendor Subscriptions</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Nxelio&apos;s own paid accounts (Unipile, AnySite, Brevo, Bright Data). Tracked manually — these vendors don&apos;t expose a billing API we integrate with.
        </p>
      </div>
      <div className="divide-y divide-slate-800">
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
      <div className="p-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white">{row.vendor_name}</p>
          <p className="text-sm text-slate-400 mt-0.5">
            {row.plan_name || "No plan set"}
            {row.monthly_cost_cents != null && ` · $${(row.monthly_cost_cents / 100).toFixed(2)}/mo`}
            {row.renewal_date && ` · renews ${new Date(row.renewal_date).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
          </p>
          {row.usage_notes && <p className="text-xs text-slate-500 mt-1">{row.usage_notes}</p>}
        </div>
        <button onClick={() => setEditing(true)} className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="font-medium text-white">{row.vendor_name}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Plan name</label>
          <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Pro"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Monthly cost (USD)</label>
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 55" type="number" step="0.01"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Renewal date</label>
          <input value={renewal} onChange={(e) => setRenewal(e.target.value)} type="date"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Usage notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 4,200 / 10,000 emails sent"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        <button onClick={() => setEditing(false)} disabled={pending} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </div>
  );
}
