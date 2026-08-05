"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { scheduleMeeting } from "@/lib/queries/meetings";

const DURATION_OPTIONS = [15, 30, 45, 60, 90];

/** Quick "schedule a meeting" modal for the Contact detail page — same shape as
 *  AddDealModal, just posting into meetings via scheduleMeeting() with
 *  contact_id set instead of lead_id. Doesn't send email invites by default;
 *  this is an internal scheduling action, not attendee notification. */
export function ScheduleMeetingModal({
  open,
  onClose,
  contactId,
  contactName,
  contactEmail,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [title, setTitle] = useState(`Meeting with ${contactName}`);
  const [startAt, setStartAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!startAt) {
      setError("Start date & time is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const start = new Date(startAt);
      const end = new Date(start.getTime() + duration * 60_000);
      const result = await scheduleMeeting(
        {
          title: title.trim(),
          description: description.trim() || null,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: location.trim() || null,
          contact_id: contactId,
          attendees: contactEmail ? [{ name: contactName, email: contactEmail }] : [],
        },
        { sendInvites: false }
      );
      if (!result.ok) {
        setError(result.error || "Couldn't schedule meeting. Try again.");
        return;
      }
      toast("Meeting scheduled.", "success");
      onClose();
      router.refresh();
    } catch {
      setError("Couldn't schedule meeting. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Schedule Meeting</h2>
            <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Title</label>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Duration</label>
                <select
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Location</label>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
                placeholder="Google Meet, phone, address..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Description</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white">
              {saving ? "Scheduling…" : "Schedule Meeting"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
