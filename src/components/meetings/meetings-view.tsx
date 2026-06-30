"use client";
import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  CalendarDays, Clock, Users, ExternalLink, Pencil, X, Plus, Link2, FileText,
  PlayCircle, Video, MapPin, CalendarClock, AlertCircle, Loader2, Wand2,
  Send, Check, ChevronLeft, UserPlus, CalendarCheck,
} from "lucide-react";
import { generateConferenceLink, type ConferenceProvider } from "@/lib/meetings/conference-link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import {
  updateMeeting, cancelMeeting, deleteMeeting, scheduleMeeting,
  type MeetingRow, type MeetingInput,
} from "@/lib/queries/meetings";
import { getCalendarBusy } from "@/lib/queries/calendar-accounts";

interface LeadOption { id: string; full_name: string | null; company_name: string | null; email: string | null }

const PROVIDERS = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "webex", label: "Webex" },
  { value: "manual", label: "Other / manual link" },
];

function leadLabel(l: { full_name: string | null; company_name: string | null; email: string | null } | null | undefined) {
  if (!l) return null;
  return l.full_name || l.company_name || l.email || "Contact";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtRange(start: string, end: string) {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
/** datetime-local value (local time) for an <input>. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const STATUS_VARIANT: Record<string, "blue" | "success" | "danger" | "default"> = {
  scheduled: "blue", completed: "success", canceled: "danger",
};

export function MeetingsView({ meetings, leads }: { meetings: MeetingRow[]; leads: LeadOption[] }) {
  const { confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [detail, setDetail] = useState<MeetingRow | null>(null);
  const [editing, setEditing] = useState<MeetingRow | "new" | null>(null);
  // LP-16 — arriving from Leads with ?leads=id1,id2 pre-opens the scheduler with those attendees.
  const [presetLeadIds, setPresetLeadIds] = useState<string[]>([]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("leads");
    if (p) {
      setPresetLeadIds(p.split(",").map((s) => s.trim()).filter(Boolean));
      setEditing("new");
    }
  }, []);

  const now = Date.now();
  const { upcoming, past } = useMemo(() => {
    const up: MeetingRow[] = [];
    const pa: MeetingRow[] = [];
    for (const m of meetings) {
      const isFuture = new Date(m.end_at).getTime() >= now;
      if (m.status === "scheduled" && isFuture) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.start_at.localeCompare(b.start_at));
    pa.sort((a, b) => b.start_at.localeCompare(a.start_at));
    return { upcoming: up, past: pa };
  }, [meetings, now]);

  // Group upcoming by day (LP-21)
  const grouped = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of upcoming) {
      const k = dayLabel(m.start_at);
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    return [...map.entries()];
  }, [upcoming]);

  function doCancel(m: MeetingRow) {
    start(async () => {
      const ok = await confirm({ title: "Cancel meeting?", message: `Cancel "${m.title}"? Attendees should be notified separately.`, confirmLabel: "Cancel meeting", danger: true });
      if (!ok) return;
      await cancelMeeting(m.id);
      setDetail(null);
    });
  }
  function doDelete(m: MeetingRow) {
    start(async () => {
      const ok = await confirm({ title: "Delete meeting?", message: `Permanently delete "${m.title}"?`, confirmLabel: "Delete", danger: true });
      if (!ok) return;
      await deleteMeeting(m.id);
      setDetail(null);
    });
  }

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Meetings"
        description="Your upcoming and past meetings, with attendees, join links, and history."
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New meeting</Button>}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card className="p-12 text-center text-slate-500">
          <CalendarClock className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          {tab === "upcoming" ? "No upcoming meetings. Click " : "No past meetings yet."}
          {tab === "upcoming" && <button onClick={() => setEditing("new")} className="font-medium text-blue-600 hover:underline">New meeting</button>}
          {tab === "upcoming" && " to schedule one."}
        </Card>
      ) : tab === "upcoming" ? (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{day}</h3>
              <div className="space-y-2">
                {items.map((m) => <MeetingRowItem key={m.id} m={m} onOpen={() => setDetail(m)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {past.map((m) => <MeetingRowItem key={m.id} m={m} onOpen={() => setDetail(m)} past />)}
        </div>
      )}

      {/* Detail panel (LP-22/23/25) */}
      {detail && (
        <DetailPanel
          m={detail}
          pending={pending}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onCancel={() => doCancel(detail)}
          onDelete={() => doDelete(detail)}
        />
      )}

      {/* Create / edit / reschedule modal */}
      {editing && (
        <MeetingFormModal
          meeting={editing === "new" ? null : editing}
          leads={leads}
          initialLeadIds={editing === "new" ? presetLeadIds : []}
          onClose={() => { setEditing(null); setPresetLeadIds([]); }}
        />
      )}
    </div>
  );
}

function MeetingRowItem({ m, onOpen, past }: { m: MeetingRow; onOpen: () => void; past?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
    >
      <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
        <Video className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900 truncate">{m.title}</p>
          {m.status !== "scheduled" && <Badge variant={STATUS_VARIANT[m.status] || "default"}>{m.status}</Badge>}
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3" /> {fmtRange(m.start_at, m.end_at)}
          {leadLabel(m.lead) && <> · <span className="truncate">{leadLabel(m.lead)}</span></>}
        </p>
      </div>
      {!past && m.join_url && (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-blue-600">
          <Video className="h-3.5 w-3.5" /> Join
        </span>
      )}
      {past && m.recording_url && <PlayCircle className="h-4 w-4 text-slate-400" />}
    </button>
  );
}

function DetailPanel({ m, pending, onClose, onEdit, onCancel, onDelete }: {
  m: MeetingRow; pending: boolean; onClose: () => void; onEdit: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-xl border-l border-slate-200 flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900 truncate">{m.title}</h2>
              {m.status !== "scheduled" && <Badge variant={STATUS_VARIANT[m.status] || "default"}>{m.status}</Badge>}
            </div>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {new Date(m.start_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <Row icon={<Clock className="h-4 w-4" />} label="Time">{fmtRange(m.start_at, m.end_at)}</Row>
          {m.location && <Row icon={<MapPin className="h-4 w-4" />} label="Location">{m.location}</Row>}
          {m.lead && (
            <Row icon={<Link2 className="h-4 w-4" />} label="Contact">
              <Link href={`/leads/${m.lead.id}`} className="text-blue-600 hover:underline">{leadLabel(m.lead)}</Link>
            </Row>
          )}
          <Row icon={<Users className="h-4 w-4" />} label={`Attendees (${attendees.length})`}>
            {attendees.length === 0 ? <span className="text-slate-400">None added</span> : (
              <ul className="space-y-0.5">
                {attendees.map((a, i) => <li key={i}>{a.name || a.email}{a.name && a.email ? ` · ${a.email}` : ""}</li>)}
              </ul>
            )}
          </Row>
          {m.description && <Row icon={<FileText className="h-4 w-4" />} label="Notes">{m.description}</Row>}
          {m.recording_url && <Row icon={<PlayCircle className="h-4 w-4" />} label="Recording"><a href={m.recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View recording</a></Row>}
          {m.summary && <Row icon={<FileText className="h-4 w-4" />} label="Summary">{m.summary}</Row>}
        </div>

        <div className="p-5 border-t border-slate-100 space-y-2">
          {m.join_url && (
            <a href={m.join_url} target="_blank" rel="noopener noreferrer">
              <Button className="w-full"><Video className="h-4 w-4" /> Join meeting <ExternalLink className="h-3.5 w-3.5 opacity-70" /></Button>
            </a>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onEdit} disabled={pending}><Pencil className="h-4 w-4" /> Edit / reschedule</Button>
            {m.status === "scheduled" && <Button variant="outline" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>}
          </div>
          <button onClick={onDelete} disabled={pending} className="w-full text-xs text-slate-400 hover:text-red-600 py-1">Delete meeting</button>
        </div>
      </aside>
    </>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="text-slate-700 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

interface Attendee { leadId?: string; name: string; email: string }

function MeetingFormModal({ meeting, leads, initialLeadIds = [], onClose }: { meeting: MeetingRow | null; leads: LeadOption[]; initialLeadIds?: string[]; onClose: () => void }) {
  const isEdit = !!meeting;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "review">("details");
  const [sendInvites, setSendInvites] = useState(true);

  const [form, setForm] = useState({
    title: meeting?.title ?? "",
    startLocal: meeting ? toLocalInput(meeting.start_at) : "",
    endLocal: meeting ? toLocalInput(meeting.end_at) : "",
    provider: meeting?.provider ?? "google_meet",
    location: meeting?.location ?? "",
    join_url: meeting?.join_url ?? "",
    description: meeting?.description ?? "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  // ── Attendees (LP-16/LP-17) ──
  const [attendees, setAttendees] = useState<Attendee[]>(() => {
    if (meeting && Array.isArray(meeting.attendees) && meeting.attendees.length) {
      return meeting.attendees.map((a) => ({ name: a.name || "", email: a.email || "" }));
    }
    return initialLeadIds
      .map((id) => leads.find((l) => l.id === id))
      .filter((l): l is LeadOption => Boolean(l))
      .map((l) => ({ leadId: l.id, name: leadLabel(l) || "", email: l.email || "" }));
  });
  const [manualEmail, setManualEmail] = useState("");

  function addLeadAttendee(id: string) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    setAttendees((a) => a.some((x) => x.leadId === id) ? a : [...a, { leadId: l.id, name: leadLabel(l) || "", email: l.email || "" }]);
  }
  function addManualEmail() {
    const e = manualEmail.trim();
    if (!e.includes("@")) return;
    setAttendees((a) => a.some((x) => x.email.toLowerCase() === e.toLowerCase()) ? a : [...a, { name: "", email: e }]);
    setManualEmail("");
  }
  const removeAttendee = (i: number) => setAttendees((a) => a.filter((_, idx) => idx !== i));
  const invitableCount = attendees.filter((a) => a.email).length;

  // ── Availability (uses connected calendar, LP-3) ──
  const [avail, setAvail] = useState<{ busy: { start: string; end: string }[]; checked: boolean; loading: boolean; error?: string }>({ busy: [], checked: false, loading: false });

  async function checkAvailability() {
    if (!form.startLocal) { setError("Pick a start date first to check availability."); return; }
    setError(null);
    const day = new Date(form.startLocal);
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
    setAvail((s) => ({ ...s, loading: true }));
    try {
      const res = await getCalendarBusy(dayStart.toISOString(), dayEnd.toISOString());
      setAvail({ busy: res.busy, checked: true, loading: false, error: res.errors[0] });
    } catch {
      setAvail({ busy: [], checked: true, loading: false, error: "Couldn't read your calendar" });
    }
  }

  const freeSlots = useMemo(() => {
    if (!avail.checked || !form.startLocal) return [];
    const day = new Date(form.startLocal); day.setHours(0, 0, 0, 0);
    const out: { startLocal: string; endLocal: string; label: string }[] = [];
    for (let h = 9; h < 18; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day); s.setHours(h, m, 0, 0);
        const e = new Date(s.getTime() + 30 * 60000);
        if (s.getTime() < Date.now()) continue;
        if (avail.busy.some((b) => new Date(b.start) < e && new Date(b.end) > s)) continue;
        out.push({ startLocal: toLocalInput(s.toISOString()), endLocal: toLocalInput(e.toISOString()), label: s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
      }
    }
    return out;
  }, [avail, form.startLocal]);

  const conflict = useMemo(() => {
    if (!avail.checked || !form.startLocal || !form.endLocal) return false;
    const s = new Date(form.startLocal), e = new Date(form.endLocal);
    return avail.busy.some((b) => new Date(b.start) < e && new Date(b.end) > s);
  }, [avail, form.startLocal, form.endLocal]);

  function build(): MeetingInput | null {
    setError(null);
    if (!form.title.trim()) { setError("Give the meeting a title."); return null; }
    if (!form.startLocal || !form.endLocal) { setError("Set a start and end time."); return null; }
    const startIso = new Date(form.startLocal).toISOString();
    const endIso = new Date(form.endLocal).toISOString();
    if (new Date(endIso) <= new Date(startIso)) { setError("End time must be after the start time."); return null; }
    return {
      title: form.title.trim(),
      start_at: startIso,
      end_at: endIso,
      provider: form.provider,
      location: form.location.trim() || null,
      join_url: form.join_url.trim() || null,
      lead_id: attendees.find((a) => a.leadId)?.leadId || null,
      description: form.description.trim() || null,
      attendees: attendees.map((a) => ({ name: a.name || undefined, email: a.email || undefined })),
    };
  }

  function goReview() { if (build()) setStep("review"); }

  function confirmSave() {
    const payload = build();
    if (!payload) { setStep("details"); return; }
    start(async () => {
      const res = isEdit ? await updateMeeting(meeting!.id, payload) : await scheduleMeeting(payload, { sendInvites });
      if (!res.ok) { setError(res.error || "Couldn't save the meeting."); setStep("details"); return; }
      onClose();
    });
  }

  const whenText = form.startLocal && form.endLocal
    ? `${new Date(form.startLocal).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – ${new Date(form.endLocal).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "—";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        <Card className="w-full max-w-lg p-6 mt-12 pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {isEdit ? "Edit / reschedule meeting" : step === "review" ? "Review & schedule" : "Schedule a meeting"}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          {step === "details" ? (
            <div className="space-y-4">
              <Field label="Title" required>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discovery call" />
              </Field>

              {/* Attendees */}
              <Field label={`Attendees${invitableCount ? ` (${invitableCount} will be invited)` : ""}`}>
                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attendees.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                        {a.name || a.email}{!a.email && <span className="text-amber-600" title="No email — won't get an invite">⚠</span>}
                        <button onClick={() => removeAttendee(i)} className="text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Select value="" onChange={(e) => { if (e.target.value) addLeadAttendee(e.target.value); }} className="flex-1">
                    <option value="">+ Add a lead…</option>
                    {leads.filter((l) => !attendees.some((a) => a.leadId === l.id)).map((l) => (
                      <option key={l.id} value={l.id}>{leadLabel(l)}{l.email ? "" : " (no email)"}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input className="flex-1" placeholder="or add an email…" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualEmail(); } }} />
                  <Button type="button" variant="outline" onClick={addManualEmail} className="flex-shrink-0"><UserPlus className="h-4 w-4" /> Add</Button>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Start" required><Input type="datetime-local" value={form.startLocal} onChange={(e) => set("startLocal", e.target.value)} /></Field>
                <Field label="End" required><Input type="datetime-local" value={form.endLocal} onChange={(e) => set("endLocal", e.target.value)} /></Field>
              </div>

              {/* Availability (LP-3 powered) */}
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5"><CalendarCheck className="h-4 w-4 text-slate-400" /> Availability</span>
                  <Button type="button" variant="outline" size="sm" onClick={checkAvailability} disabled={avail.loading}>
                    {avail.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Check my calendar
                  </Button>
                </div>
                {avail.checked && (
                  <div className="mt-2 text-xs">
                    {avail.error ? (
                      <p className="text-slate-400">Calendar not connected — connect it in Settings → Calendar to see free times.</p>
                    ) : (
                      <>
                        {conflict && <p className="text-red-600 mb-1.5 inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> This time overlaps a busy event on your calendar.</p>}
                        {!conflict && form.startLocal && <p className="text-emerald-600 mb-1.5 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> You&apos;re free at the selected time.</p>}
                        {freeSlots.length > 0 && (
                          <>
                            <p className="text-slate-500 mb-1">Free 30-min slots that day — click to use:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {freeSlots.slice(0, 12).map((s) => (
                                <button key={s.startLocal} onClick={() => { set("startLocal", s.startLocal); set("endLocal", s.endLocal); }}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50">
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Conferencing">
                  <Select value={form.provider} onChange={(e) => set("provider", e.target.value)}>
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </Field>
                <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room or address (optional)" /></Field>
              </div>
              <Field label="Join link">
                <div className="flex gap-2">
                  <Input className="flex-1" value={form.join_url} onChange={(e) => set("join_url", e.target.value)} placeholder="https://… (optional)" />
                  <Button type="button" variant="outline" onClick={() => set("join_url", generateConferenceLink(form.provider as ConferenceProvider, form.title))} disabled={form.provider === "manual"} className="flex-shrink-0">
                    <Wand2 className="h-4 w-4" /> Generate
                  </Button>
                </div>
              </Field>
              <Field label="Notes"><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Agenda or context (optional)" /></Field>
            </div>
          ) : (
            /* ── Review step (LP-18) ── */
            <div className="space-y-3 text-sm">
              <ReviewRow label="Title">{form.title}</ReviewRow>
              <ReviewRow label="When">{whenText}</ReviewRow>
              <ReviewRow label="Attendees">
                {attendees.length === 0 ? <span className="text-slate-400">None</span> : (
                  <ul className="space-y-0.5">{attendees.map((a, i) => <li key={i}>{a.name || a.email}{a.name && a.email ? ` · ${a.email}` : ""}{!a.email && <span className="text-amber-600"> · no email</span>}</li>)}</ul>
                )}
              </ReviewRow>
              <ReviewRow label="Conferencing">{PROVIDERS.find((p) => p.value === form.provider)?.label}{form.join_url ? ` · ${form.join_url}` : ""}</ReviewRow>
              {form.location && <ReviewRow label="Location">{form.location}</ReviewRow>}
              {form.description && <ReviewRow label="Notes">{form.description}</ReviewRow>}

              {!isEdit && (
                <label className="flex items-center gap-2 pt-2 text-slate-700">
                  <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Email an invite (with the join link) to the {invitableCount} attendee{invitableCount === 1 ? "" : "s"} with an email
                </label>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between gap-2 mt-6">
            {step === "review"
              ? <Button variant="ghost" onClick={() => setStep("details")} disabled={pending}><ChevronLeft className="h-4 w-4" /> Back</Button>
              : <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>}
            {isEdit ? (
              <Button onClick={confirmSave} disabled={pending}>
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
              </Button>
            ) : step === "details" ? (
              <Button onClick={goReview} disabled={pending}>Review →</Button>
            ) : (
              <Button onClick={confirmSave} disabled={pending}>
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</> : <><Send className="h-4 w-4" /> {sendInvites && invitableCount ? "Schedule & send invites" : "Schedule meeting"}</>}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 flex-shrink-0 text-xs font-medium uppercase tracking-wider text-slate-400 pt-0.5">{label}</span>
      <div className="flex-1 text-slate-700">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}
