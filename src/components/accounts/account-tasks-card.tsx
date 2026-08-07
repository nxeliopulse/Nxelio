"use client";
import { useTransition } from "react";
import { Check, User } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { updateAccountTask, updateAccountTaskStatus, type AccountTaskRow } from "@/lib/queries/account-tasks";
import { cn, formatDateTime } from "@/lib/utils";
import type { OwnerOption } from "@/components/contacts/contacts-table";

const REMINDER_OPTIONS = ["15 min before", "1 hr before", "1 day before", "No reminder"] as const;
const PRIORITY_OPTIONS = ["Low", "Medium", "High"] as const;

const PRIORITY_STYLES: Record<AccountTaskRow["priority"], string> = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  High: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
};

const fieldStyle = "w-full h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-600 text-xs px-2.5 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500";
const labelStyle = "block text-[11px] font-bold text-slate-700 dark:text-slate-600 mb-1.5";

/** Upcoming (not-yet-done) tasks/reminders logged against an account. Mirrors
 *  ContactTasksCard exactly — same simple, self-contained list, just scoped
 *  to a single account. */
export function AccountTasksCard({
  accountId,
  tasks,
  owners,
}: {
  accountId: string;
  tasks: AccountTaskRow[];
  owners: OwnerOption[];
}) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();

  const upcoming = tasks.filter((t) => t.status !== "done");

  function markDone(id: string) {
    start(async () => {
      const res = await updateAccountTaskStatus(id, accountId, "done");
      if (!res.ok) toast(res.error || "Couldn't update task", "error");
    });
  }

  function patch(id: string, fields: Partial<Pick<AccountTaskRow, "reminder" | "priority" | "assigned_to">>) {
    start(async () => {
      const res = await updateAccountTask(id, accountId, fields);
      if (!res.ok) toast(res.error || "Couldn't update task", "error");
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
      <div className="px-4 py-3 bg-slate-50/80 dark:bg-[var(--muted)] border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-slate-800 dark:text-slate-700">
        Tasks ({upcoming.length})
      </div>

      <div className="p-4 space-y-3 text-xs">
        {upcoming.length === 0 ? (
          <p className="text-slate-400 italic">No upcoming tasks.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-3 flex items-start gap-3">
                  <button
                    onClick={() => markDone(t.id)}
                    disabled={pending}
                    title="Mark done"
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border border-slate-300 dark:border-slate-700 flex items-center justify-center text-transparent hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center text-white flex-shrink-0">
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-800 dark:text-slate-700">{t.title}</p>
                      <span className={cn("flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold", PRIORITY_STYLES[t.priority])}>
                        {t.priority}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1.5">{t.due_at ? formatDateTime(t.due_at) : "No due date"}</p>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelStyle}>Reminder <span className="text-red-500">*</span></label>
                    <select
                      className={fieldStyle}
                      value={t.reminder || "No reminder"}
                      disabled={pending}
                      onChange={(e) => patch(t.id, { reminder: e.target.value === "No reminder" ? null : e.target.value })}
                    >
                      {REMINDER_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Task Priority <span className="text-red-500">*</span></label>
                    <select
                      className={fieldStyle}
                      value={t.priority}
                      disabled={pending}
                      onChange={(e) => patch(t.id, { priority: e.target.value as AccountTaskRow["priority"] })}
                    >
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Assigned To <span className="text-red-500">*</span></label>
                    <select
                      className={fieldStyle}
                      value={t.assigned_to || ""}
                      disabled={pending}
                      onChange={(e) => patch(t.id, { assigned_to: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
