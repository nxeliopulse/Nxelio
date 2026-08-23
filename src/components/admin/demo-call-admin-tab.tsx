"use client";
import { useState, useTransition } from "react";
import { UserPlus, UserMinus, CalendarPlus, PhoneCall, Loader2, Trash2, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  addDemoCallPerson, removeDemoCallPerson, addDemoCallSlot,
  setSlotAssignmentLive, clearSlotAssignmentLive, deleteSlotAssignment,
  getDemoCallPeople, getDemoCallSlots,
  type DemoCallPerson, type DemoCallSlot,
} from "@/lib/queries/demo-call-admin";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-08-25" -> "Tue, Aug 25, 2026" */
function formatSlotDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "10:00:00" -> "10:00 AM" */
function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const meridiem = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${meridiem}`;
}

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-blue-300";
const labelClass = "text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1";
const primaryButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18A7B8] hover:bg-[#14929f] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors";
const destructiveButtonClass = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 flex-shrink-0";

export function DemoCallAdminTab({ initialPeople, initialSlots }: { initialPeople: DemoCallPerson[]; initialSlots: DemoCallSlot[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [slots, setSlots] = useState(initialSlots);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [designation, setDesignation] = useState("");
  const [personError, setPersonError] = useState<string | null>(null);

  function addEmailChip() {
    const e = emailInput.trim().toLowerCase();
    if (!e.includes("@")) { setPersonError("Enter a valid email."); return; }
    if (!emails.includes(e)) setEmails((prev) => [...prev, e]);
    setEmailInput("");
    setPersonError(null);
  }

  function removeEmailChip(e: string) {
    setEmails((prev) => prev.filter((x) => x !== e));
  }

  const [slotPersonId, setSlotPersonId] = useState("");
  const [slotDate, setSlotDate] = useState(todayStr());
  const [slotStart, setSlotStart] = useState("10:00");
  const [slotEnd, setSlotEnd] = useState("11:00");
  const [slotError, setSlotError] = useState<string | null>(null);

  async function refreshAll() {
    const [nextPeople, nextSlots] = await Promise.all([getDemoCallPeople(), getDemoCallSlots()]);
    setPeople(nextPeople);
    setSlots(nextSlots);
  }

  function handleAddPerson() {
    setPersonError(null);
    if (!name.trim()) return setPersonError("Enter a name.");
    // A still-typed, not-yet-added address counts too — don't make the user
    // remember to click "Add" before submitting.
    const allEmails = emailInput.trim() ? Array.from(new Set([...emails, emailInput.trim().toLowerCase()])) : emails;
    if (!allEmails.length) return setPersonError("Add at least one email.");
    startTransition(async () => {
      const res = await addDemoCallPerson({ name, emails: allEmails, designation });
      if (!res.ok) { setPersonError(res.error || "Couldn't add that person."); return; }
      await refreshAll();
      setName(""); setEmails([]); setEmailInput(""); setDesignation("");
    });
  }

  function handleRemovePerson(id: string) {
    startTransition(async () => {
      const res = await removeDemoCallPerson(id);
      if (res.ok) await refreshAll();
    });
  }

  function handleAddSlot() {
    setSlotError(null);
    if (!slotDate) return setSlotError("Pick a date.");
    if (!slotStart || !slotEnd) return setSlotError("Pick a start and end time.");
    if (slotEnd <= slotStart) return setSlotError("End time must be after start time.");
    startTransition(async () => {
      const res = await addDemoCallSlot({ personId: slotPersonId, date: slotDate, startTime: slotStart, endTime: slotEnd });
      if (!res.ok) { setSlotError(res.error || "Couldn't create that slot."); return; }
      await refreshAll();
      setSlotPersonId("");
    });
  }

  function handleToggleLive(slotId: string, assignmentId: string, live: boolean) {
    startTransition(async () => {
      const res = live
        ? await setSlotAssignmentLive(assignmentId, slotId)
        : await clearSlotAssignmentLive(assignmentId);
      if (res.ok) await refreshAll();
    });
  }

  function handleDeleteAssignment(assignmentId: string) {
    startTransition(async () => {
      const res = await deleteSlotAssignment(assignmentId);
      if (res.ok) await refreshAll();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Add a person */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <UserPlus className="h-4.5 w-4.5 text-[#18A7B8]" /> Add a person
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Add someone to the demo call roster so they can be assigned to time slots.
            </p>
          </div>

          <div className="p-5 space-y-3">
            <div>
              <label className={labelClass}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email(s)</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmailChip(); } }}
                  placeholder="jane@company.com"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addEmailChip}
                  className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-sm font-semibold text-slate-600 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {emails.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {emails.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-400">
                      {e}
                      <button type="button" onClick={() => removeEmailChip(e)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>Designation</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Sales Rep" className={inputClass} />
            </div>
            {personError && <p className="text-xs text-red-600">{personError}</p>}
            <button onClick={handleAddPerson} disabled={pending} className={primaryButtonClass}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add person
            </button>
          </div>

          <div className="px-5 pb-2">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">People ({people.length})</p>
          </div>
          {people.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-400 text-center">No one on the roster yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70 border-t border-slate-100 dark:border-slate-800">
              {people.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-[var(--muted)] transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                      {p.emails.join(", ")}{p.designation && ` · ${p.designation}`}
                    </p>
                  </div>
                  <button onClick={() => handleRemovePerson(p.id)} disabled={pending} className={destructiveButtonClass}>
                    <UserMinus className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add a demo call slot */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm h-fit">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <CalendarPlus className="h-4.5 w-4.5 text-[#18A7B8]" /> Add a demo call slot
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Open a bookable time window and assign an initial live rep.
            </p>
          </div>

          <div className="p-5 space-y-3">
            <div>
              <label className={labelClass}>Person</label>
              <select value={slotPersonId} onChange={(e) => setSlotPersonId(e.target.value)} className={inputClass}>
                <option value="">Select a person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start time</label>
                <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End time</label>
                <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className={inputClass} />
              </div>
            </div>
            {slotError && <p className="text-xs text-red-600">{slotError}</p>}
            <button onClick={handleAddSlot} disabled={pending} className={primaryButtonClass}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Add slot
            </button>
          </div>
        </div>
      </div>

      {/* Demo call slots */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <PhoneCall className="h-4.5 w-4.5 text-[#18A7B8]" /> Demo call slots
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Toggling a person ON for a slot automatically turns everyone else in that same slot OFF — only one person can be live for demo calls at a time.
          </p>
        </div>

        {slots.length === 0 ? (
          <p className="p-8 text-sm text-slate-400 text-center">No demo call slots yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {slots.map((s) => {
              const live = s.assignments.find((a) => a.is_live);
              return (
                <div key={s.id}>
                  <div className="px-5 py-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{formatSlotDate(s.slot_date)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500">{formatTime(s.start_time)} – {formatTime(s.end_time)}</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                        live
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
                      }`}
                    >
                      {live ? `Live: ${live.name}` : "No one live"}
                    </span>
                  </div>
                  {s.assignments.map((a) => (
                    <div
                      key={a.id}
                      className={`px-5 py-3 flex items-center justify-between gap-3 border-t border-slate-50 dark:border-slate-900 transition-colors ${
                        a.is_live ? "bg-emerald-50/70 dark:bg-emerald-500/10" : "hover:bg-slate-50/60 dark:hover:bg-[var(--muted)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{a.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                          {a.designation && `${a.designation} · `}{a.emails.join(", ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Switch
                          checked={a.is_live}
                          onChange={(v) => handleToggleLive(s.id, a.id, v)}
                          disabled={pending}
                          className={a.is_live ? "bg-emerald-600" : ""}
                          aria-label={`Mark ${a.name} live for this slot`}
                        />
                        <button onClick={() => handleDeleteAssignment(a.id)} disabled={pending} className={destructiveButtonClass}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
