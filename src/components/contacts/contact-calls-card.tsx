"use client";
import { useState, useTransition } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { cn, formatDateTime } from "@/lib/utils";
import { deleteContactCall, updateContactCallOutcome, type ContactCallRow } from "@/lib/queries/contact-calls";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/contact-calls-constants";

const AVATAR_COLORS = ["bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500"];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function avatarColor(name: string): string {
  return AVATAR_COLORS[hashCode(name) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

const OUTCOME_STYLE: Record<CallOutcome, string> = {
  Connected: "text-emerald-700 dark:text-emerald-400",
  Busy: "text-amber-700 dark:text-amber-400",
  "No Answer": "text-slate-500 dark:text-slate-400",
  "Left Voicemail": "text-blue-700 dark:text-blue-400",
  "Wrong Number": "text-rose-700 dark:text-rose-400",
};

/** Real call log per contact (contact_calls, 0100) — outcome + notes + when,
 *  logged by whoever recorded it. Fills the "Calls" tab with real data. */
export function ContactCallsCard({ contactId, calls, onAddNew }: { contactId: string; calls: ContactCallRow[]; onAddNew: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Calls</h5>
        <button onClick={onAddNew} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add New
        </button>
      </div>

      {calls.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-6">No calls logged for this contact yet.</p>
      ) : (
        <ul className="space-y-3">
          {calls.map((c) => (
            <CallItem key={c.id} call={c} contactId={contactId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CallItem({ call, contactId }: { call: ContactCallRow; contactId: string }) {
  const { confirm, toast } = useFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, start] = useTransition();
  const author = call.author_name || "Unknown";

  function changeOutcome(outcome: CallOutcome) {
    start(async () => {
      const res = await updateContactCallOutcome(call.id, contactId, outcome);
      if (!res.ok) toast(res.error || "Couldn't update call", "error");
    });
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete call?", message: "This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    start(async () => {
      await deleteContactCall(call.id, contactId);
    });
  }

  return (
    <li className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-start gap-2.5">
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0", avatarColor(author))}>
          {initials(author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-700 dark:text-slate-600">
              <span className="font-bold text-slate-800 dark:text-slate-700">{author}</span> logged a call on {formatDateTime(call.call_time)}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <select
                value={call.outcome}
                disabled={pending}
                onChange={(e) => changeOutcome(e.target.value as CallOutcome)}
                className={cn("h-7 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-bold px-2 outline-none", OUTCOME_STYLE[call.outcome])}
              >
                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <div className="relative">
                <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-[var(--muted)]">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                      <button onClick={handleDelete} className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {call.notes && <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1.5">{call.notes}</p>}
        </div>
      </div>
    </li>
  );
}
