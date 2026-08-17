"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createSalesQuota, deleteSalesQuota } from "@/lib/queries/sales-quotas";
import type { SalesQuotaRow } from "@/lib/queries/sales-quotas";

interface Props {
  quotas: SalesQuotaRow[];
  users: { user_id: string; full_name?: string | null; email?: string | null }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfNextMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
}

export function SalesQuotasManager({ quotas: initialQuotas, users }: Props) {
  const { toast, confirm } = useFeedback();
  const [quotas, setQuotas] = useState(initialQuotas);
  const [pending, start] = useTransition();

  const [userId, setUserId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(firstOfNextMonthIso());
  const [targetAmount, setTargetAmount] = useState("");
  const [quotaType, setQuotaType] = useState<"revenue" | "pipeline">("revenue");

  function userLabel(id: string | null) {
    if (!id) return "Whole Team";
    const u = users.find((u) => u.user_id === id);
    return u?.full_name || u?.email || "Unknown user";
  }

  function handleAdd() {
    const amount = Number(targetAmount);
    if (!amount || amount <= 0) {
      toast("Enter a target amount greater than 0.", "error");
      return;
    }
    if (periodEnd < periodStart) {
      toast("End date must be on or after the start date.", "error");
      return;
    }
    start(async () => {
      const result = await createSalesQuota({
        userId: userId || null,
        periodStart,
        periodEnd,
        targetAmount: amount,
        quotaType,
      });
      if (!result.ok) {
        toast(result.error || "Couldn't create quota.", "error");
        return;
      }
      setQuotas((prev) => [
        { id: crypto.randomUUID(), userId: userId || null, periodStart, periodEnd, targetAmount: amount, quotaType },
        ...prev,
      ]);
      setTargetAmount("");
      toast("Quota added.", "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete quota?", message: "This target will no longer be used in Revenue or Team analytics.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      const result = await deleteSalesQuota(id);
      if (!result.ok) {
        toast(result.error || "Couldn't delete quota.", "error");
        return;
      }
      setQuotas((prev) => prev.filter((q) => q.id !== id));
      toast("Quota deleted.", "success");
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-900">Sales Quotas</h3>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Set revenue or pipeline targets for the whole team or a specific rep. These drive Pipeline Coverage,
        Quota Attainment, and Gap to Target on Revenue Analytics, and the Team leaderboard.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Rep</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Whole Team</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Start</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">End</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Target ($)</label>
          <input type="number" min="0" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="50000" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
          <select value={quotaType} onChange={(e) => setQuotaType(e.target.value as "revenue" | "pipeline")} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            <option value="revenue">Revenue</option>
            <option value="pipeline">Pipeline</option>
          </select>
        </div>
      </div>
      <Button size="sm" onClick={handleAdd} disabled={pending} className="mb-4">
        <Plus className="h-3.5 w-3.5" /> Add Quota
      </Button>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">Rep</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {quotas.map((q) => (
              <tr key={q.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{userLabel(q.userId)}</td>
                <td className="px-3 py-2 text-slate-500">{q.periodStart} → {q.periodEnd}</td>
                <td className="px-3 py-2 capitalize text-slate-500">{q.quotaType}</td>
                <td className="px-3 py-2 text-right font-medium">${q.targetAmount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => handleDelete(q.id)} className="p-1 text-slate-400 hover:text-red-600" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {quotas.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No quotas set yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
