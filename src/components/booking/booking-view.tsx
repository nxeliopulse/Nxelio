"use client";
import { useState, useTransition } from "react";
import { CalendarDays, Clock, CheckCircle2, AlertCircle, Loader2, Video, ArrowLeft } from "lucide-react";
import { bookMeeting, type BookingDay } from "@/lib/queries/booking";

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function BookingView({ slug, hostName, days }: { slug: string; hostName: string; days: BookingDay[] }) {
  const [pending, start] = useTransition();
  const [slot, setSlot] = useState<{ startIso: string; endIso: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    if (!slot) return;
    if (!form.name.trim()) return setError("Please enter your name.");
    if (!form.email.includes("@")) return setError("Please enter a valid email.");
    start(async () => {
      const res = await bookMeeting({ slug, name: form.name, email: form.email, note: form.note, startIso: slot.startIso, endIso: slot.endIso });
      if (!res.ok) { setError(res.error || "Couldn't book that time."); return; }
      setDone(true);
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white mb-3"><CalendarDays className="h-6 w-6" /></div>
          <h1 className="text-2xl font-bold text-slate-900">Book a meeting with {hostName}</h1>
          <p className="text-slate-500 mt-1">Pick a time that works for you.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {done ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-xl font-semibold text-slate-900">You&apos;re booked!</h2>
              <p className="text-slate-500 mt-1">
                Your meeting with {hostName} is confirmed for <span className="font-medium text-slate-700">{slot && dayLabel(slot.startIso)}, {slot && timeLabel(slot.startIso)}</span>.
              </p>
              <p className="text-sm text-slate-400 mt-3">A confirmation with the join link is on its way to {form.email}.</p>
            </div>
          ) : error && !slot ? null : !slot ? (
            // Step 1 — pick a slot
            days.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Clock className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                No open times available right now. Please check back later.
              </div>
            ) : (
              <div className="space-y-6 max-h-[60vh] overflow-y-auto">
                {days.map((d) => (
                  <div key={d.date}>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">{dayLabel(d.date)}</h3>
                    <div className="flex flex-wrap gap-2">
                      {d.slots.map((s) => (
                        <button
                          key={s.startIso}
                          onClick={() => { setSlot(s); setError(null); }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          {timeLabel(s.startIso)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Step 2 — details
            <div className="space-y-4">
              <button onClick={() => setSlot(null)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" /> Change time
              </button>
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-900 flex items-center gap-2">
                <Clock className="h-4 w-4" /> {dayLabel(slot.startIso)} · {timeLabel(slot.startIso)} – {timeLabel(slot.endIso)}
                <span className="ml-auto inline-flex items-center gap-1 text-blue-700"><Video className="h-3.5 w-3.5" /> Google Meet</span>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Your name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Anything to add? (optional)</label>
                <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What would you like to discuss?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-300 resize-none" />
              </div>

              <button onClick={submit} disabled={pending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : "Confirm booking"}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">Powered by Nxelio</p>
      </div>
    </div>
  );
}
