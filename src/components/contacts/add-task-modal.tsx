"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createContactTask } from "@/lib/queries/contact-tasks";
import type { OwnerOption } from "@/components/contacts/contacts-table";

const REMINDER_OPTIONS = ["15 min before", "1 hr before", "1 day before", "No reminder"] as const;
const PRIORITY_OPTIONS = ["Low", "Medium", "High"] as const;

const fieldStyle =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]";
const labelStyle = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5";

/** Modal for adding a task/reminder against a contact — same centered
 *  backdrop-card pattern as AddDealModal, just with more fields. */
export function AddTaskModal({
  open,
  onClose,
  contactId,
  owners,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  owners: OwnerOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminder, setReminder] = useState<string>("1 hr before");
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setTitle("");
    setDescription("");
    setDueAt("");
    setReminder("1 hr before");
    setPriority("Medium");
    setAssignedTo("");
    setError(null);
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!assignedTo) {
      setError("Assigned To is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await createContactTask({
        contact_id: contactId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        reminder: reminder === "No reminder" ? null : reminder,
        priority,
        assigned_to: assignedTo,
      });
      if (!res.ok) {
        setError(res.error || "Couldn't create task. Try again.");
        setSaving(false);
        return;
      }
      toast("Task created.", "success");
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("Couldn't create task. Try again.");
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
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Add Task</h2>
            <button onClick={handleClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}

            <div>
              <label className={labelStyle}>Title</label>
              <input className={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up call" />
            </div>

            <div>
              <label className={labelStyle}>Description</label>
              <textarea
                className={fieldStyle + " resize-none"}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details…"
              />
            </div>

            <div>
              <label className={labelStyle}>Due Date &amp; Time</label>
              <input type="datetime-local" className={fieldStyle} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>

            <div>
              <label className={labelStyle}>Reminder</label>
              <select className={fieldStyle} value={reminder} onChange={(e) => setReminder(e.target.value)}>
                {REMINDER_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelStyle}>
                Task Priority <span className="text-red-600">*</span>
              </label>
              <select className={fieldStyle} value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITY_OPTIONS)[number])}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelStyle}>
                Assigned To <span className="text-red-600">*</span>
              </label>
              <select className={fieldStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Select...</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white">
              {saving ? "Creating…" : "Create Task"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
