"use client";
import { useEffect, useState, useTransition } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  listReportSchedules,
  createReportSchedule,
  deleteReportSchedule,
  type ReportScheduleRow,
} from "@/lib/queries/report-schedules";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describe(s: ReportScheduleRow): string {
  const at = `${String(s.hourUtc).padStart(2, "0")}:00 UTC`;
  if (s.frequency === "daily") return `Daily at ${at}`;
  if (s.frequency === "weekly") return `Weekly on ${DAY_NAMES[s.dayOfWeek ?? 0]} at ${at}`;
  return `Monthly on day ${s.dayOfMonth ?? 1} at ${at}`;
}

export function ReportScheduleModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();

  const [recipients, setRecipients] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hourUtc, setHourUtc] = useState(8);

  useEffect(() => {
    listReportSchedules(reportId).then((rows) => { setSchedules(rows); setLoaded(true); });
  }, [reportId]);

  function handleCreate() {
    const emails = recipients.split(",").map((e) => e.trim()).filter(Boolean);
    if (!emails.length) {
      toast("Enter at least one recipient email.", "error");
      return;
    }
    start(async () => {
      const result = await createReportSchedule({
        reportId,
        recipients: emails,
        frequency,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
        hourUtc,
      });
      if (!result.ok) {
        toast(result.error || "Couldn't create schedule.", "error");
        return;
      }
      setSchedules(await listReportSchedules(reportId));
      setRecipients("");
      toast("Schedule created.", "success");
    });
  }

  function handleDelete(id: string) {
    start(async () => {
      const result = await deleteReportSchedule(id);
      if (!result.ok) {
        toast(result.error || "Couldn't delete schedule.", "error");
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Scheduled CSV Email Export</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {loaded && schedules.length > 0 && (
            <div className="space-y-1.5">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">{describe(s)}</p>
                    <p className="text-[11px] text-slate-400 truncate">{s.recipients.join(", ")}</p>
                  </div>
                  <button onClick={() => handleDelete(s.id)} disabled={pending} className="p-1 text-slate-400 hover:text-red-600 flex-shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Recipients (comma-separated)</label>
              <input
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="you@company.com, teammate@company.com"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Hour (UTC)</label>
                <select value={hourUtc} onChange={(e) => setHourUtc(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </div>
            </div>
            {frequency === "weekly" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Day of week</label>
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {frequency === "monthly" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Day of month</label>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <Button size="sm" onClick={handleCreate} disabled={pending} className="w-full">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Add Schedule
            </Button>
            <p className="text-[11px] text-slate-400">Sends this report as a CSV file attached to an email. PDF/Excel export isn&apos;t available yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
