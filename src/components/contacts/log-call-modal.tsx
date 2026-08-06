"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createContactCall } from "@/lib/queries/contact-calls";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/contact-calls-constants";

const fieldStyle =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]";
const labelStyle = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5";

/** Log a call against a contact — real data, same centered-modal pattern as AddDealModal. */
export function LogCallModal({ open, onClose, contactId }: { open: boolean; onClose: () => void; contactId: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [outcome, setOutcome] = useState<CallOutcome>("Connected");
  const [notes, setNotes] = useState("");
  const [callTime, setCallTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setOutcome("Connected");
    setNotes("");
    setCallTime("");
    setError(null);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await createContactCall(contactId, {
        outcome,
        notes: notes.trim() || null,
        call_time: callTime ? new Date(callTime).toISOString() : null,
      });
      if (!res.ok) {
        setError(res.error || "Couldn't log call. Try again.");
        return;
      }
      toast("Call logged.", "success");
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("Couldn't log call. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Log Call</h2>
            <button onClick={handleClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}
            <div>
              <label className={labelStyle}>Outcome</label>
              <select className={fieldStyle} value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>When</label>
              <input type="datetime-local" className={fieldStyle} value={callTime} onChange={(e) => setCallTime(e.target.value)} placeholder="Now" />
              <p className="text-[10px] text-slate-400 mt-1">Leave blank to use right now.</p>
            </div>
            <div>
              <label className={labelStyle}>Notes</label>
              <textarea rows={3} className={fieldStyle + " resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed…" />
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Logging…" : "Log Call"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
