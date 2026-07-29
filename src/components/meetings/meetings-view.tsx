"use client";
import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  CalendarDays, Clock, Users, ExternalLink, Pencil, X, Plus, Link2, FileText,
  PlayCircle, Video, MapPin, AlertCircle, Loader2, Wand2,
  Send, Check, ChevronLeft, ChevronRight, UserPlus, CalendarCheck, RefreshCw,
  CheckSquare, Square, Globe,
} from "lucide-react";
import { generateConferenceLink, type ConferenceProvider } from "@/lib/meetings/conference-link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import {
  updateMeeting, cancelMeeting, deleteMeeting, scheduleMeeting,
  type MeetingRow, type MeetingInput,
} from "@/lib/queries/meetings";
import {
  getCalendarBusy, getCalendarAccounts, getExternalCalendarEvents, createGoogleMeetLink,
  type CalendarAccountRow, type SyncedCalendarEvent,
} from "@/lib/queries/calendar-accounts";
import { createZoomMeetingLink } from "@/lib/queries/zoom-accounts";
import { cn } from "@/lib/utils";

/** Per-provider accent used consistently across the legend, day chips, and agenda. */
const PROVIDER_STYLE: Record<string, { dot: string; chip: string; label: string }> = {
  google: { dot: "bg-blue-500", chip: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800", label: "Google Calendar" },
  microsoft: { dot: "bg-indigo-500", chip: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800", label: "Outlook Calendar" },
};

interface LeadOption { id: string; full_name: string | null; company_name: string | null; email: string | null }

const PROVIDERS = [
  { value: "google_meet", label: "Google Meet" },
  { value: "zoom", label: "Zoom" },
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
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
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
  const [viewMode, setViewMode] = useState<"month" | "upcoming" | "past">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [detail, setDetail] = useState<MeetingRow | null>(null);
  const [editing, setEditing] = useState<MeetingRow | "new" | null>(null);
  
  // Zoho Calendar sidebar visibility filters
  const [showMyMeetings, setShowMyMeetings] = useState(true);
  const [showExternalCalendars, setShowExternalCalendars] = useState(true);

  const [presetLeadIds, setPresetLeadIds] = useState<string[]>([]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("leads");
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setPresetLeadIds(p.split(",").map((s) => s.trim()).filter(Boolean));
      setEditing("new");
    }
  }, []);

  const [accounts, setAccounts] = useState<CalendarAccountRow[]>([]);
  useEffect(() => {
    getCalendarAccounts().then(setAccounts).catch(() => {});
  }, []);

  const [external, setExternal] = useState<{ events: SyncedCalendarEvent[]; errors: string[]; loading: boolean }>({ events: [], errors: [], loading: false });
  const monthRange = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 42);
    return { start: gridStart.toISOString(), end: gridEnd.toISOString() };
  }, [calendarMonth]);

  useEffect(() => {
    if (accounts.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets external-calendar state when the last connected account is removed, not a mount-only init
      setExternal({ events: [], errors: [], loading: false });
      return;
    }
    let cancelled = false;
    setExternal((s) => ({ ...s, loading: true }));
    getExternalCalendarEvents(monthRange.start, monthRange.end)
      .then((res) => { if (!cancelled) setExternal({ ...res, loading: false }); })
      .catch(() => { if (!cancelled) setExternal({ events: [], errors: ["Couldn't sync your calendar"], loading: false }); });
    return () => { cancelled = true; };
  }, [monthRange, accounts.length]);

  const externalByDay = useMemo(() => {
    const map = new Map<string, SyncedCalendarEvent[]>();
    if (!showExternalCalendars) return map;
    for (const e of external.events) {
      const k = dateKey(new Date(e.start));
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return map;
  }, [external.events, showExternalCalendars]);

  const [now] = useState(() => Date.now());
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

  const grouped = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of upcoming) {
      const k = dayLabel(m.start_at);
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    return [...map.entries()];
  }, [upcoming]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    if (!showMyMeetings) return map;
    for (const m of meetings) {
      const k = dateKey(new Date(m.start_at));
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return map;
  }, [meetings, showMyMeetings]);

  const selectedDayKey = dateKey(selectedDay);
  const selectedDayAgenda = useMemo(() => {
    type AgendaItem = { key: string; start: string; end: string; kind: "meeting"; meeting: MeetingRow } | { key: string; start: string; end: string; kind: "external"; event: SyncedCalendarEvent };
    const dayMeetings = meetingsByDay.get(selectedDayKey) ?? [];
    const dayExternal = externalByDay.get(selectedDayKey) ?? [];
    const items: AgendaItem[] = [
      ...dayMeetings.map((m) => ({ key: `m-${m.id}`, start: m.start_at, end: m.end_at, kind: "meeting" as const, meeting: m })),
      ...dayExternal.map((e) => ({ key: `e-${e.id}`, start: e.start, end: e.end, kind: "external" as const, event: e })),
    ];
    items.sort((a, b) => a.start.localeCompare(b.start));
    return items;
  }, [meetingsByDay, externalByDay, selectedDayKey]);

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

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Top Header & Primary Schedule Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Meetings & Calendar</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Schedule, track, and sync meetings with Google & Outlook Calendar
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {accounts.length === 0 ? (
            <Link href="/settings?section=calendar" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              <RefreshCw className="h-3.5 w-3.5" /> Connect Calendar
            </Link>
          ) : (
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected ({accounts.length})
            </div>
          )}
          <Button
            onClick={() => setEditing("new")}
            className="rounded-xl font-bold px-4 py-2 text-xs sm:text-sm gap-2"
          >
            <Plus className="h-4 w-4" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {/* Zero-Scroll Zoho Grid Layout: Left Control Panel + Right Calendar Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Left Control Sidebar (Unified Single Card - Stretches 100% to match Big Calendar height) */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex-1 flex flex-col justify-between space-y-4">
            {/* Section 1: Mini Month Picker */}
            <div className="flex-shrink-0">
              <MiniCalendar
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Section 2: My Calendars Checkboxes */}
            <div className="flex-shrink-0 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">My Calendars</h3>
              <div className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => setShowMyMeetings(!showMyMeetings)}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-md bg-blue-600 dark:bg-blue-500 flex-shrink-0" />
                    <span className="text-slate-900 dark:text-white font-semibold">LeadPro Meetings</span>
                  </div>
                  {showMyMeetings ? <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> : <Square className="h-3.5 w-3.5 text-slate-300 dark:text-slate-700" />}
                </button>

                {accounts.map((a) => {
                  const style = PROVIDER_STYLE[a.provider] || PROVIDER_STYLE.google;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setShowExternalCalendars(!showExternalCalendars)}
                      className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-md ${style.dot} flex-shrink-0`} />
                        <span className="text-slate-900 dark:text-white truncate max-w-[140px]">{style.label}</span>
                      </div>
                      {showExternalCalendars ? <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> : <Square className="h-3.5 w-3.5 text-slate-300 dark:text-slate-700" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Region / Time Zone Live Clock Widget */}
            <div className="flex-shrink-0">
              <RegionClockWidget />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Section 3: Selected Day Schedule / Events List (Expands to fill remaining vertical space!) */}
            <div className="flex-1 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {selectedDay.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedDayAgenda.length} event{selectedDayAgenda.length === 1 ? "" : "s"} scheduled
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing("new")}
                  className="rounded-xl gap-1 font-bold text-xs h-7 px-2.5"
                >
                  <Plus className="h-3 w-3" /> Add Event
                </Button>
              </div>

              {selectedDayAgenda.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-1 flex-1 flex flex-col items-center justify-center">
                  <p>No events on this day.</p>
                  {upcoming[0] && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Next: <span className="font-bold text-slate-700 dark:text-slate-300">{upcoming[0].title}</span> ({dayLabel(upcoming[0].start_at)})
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 flex-1 min-h-[140px]">
                  {selectedDayAgenda.map((item) =>
                    item.kind === "meeting" ? (
                      <MeetingRowItem key={item.key} m={item.meeting} onOpen={() => setDetail(item.meeting)} past={new Date(item.meeting.end_at).getTime() < now} compact />
                    ) : (
                      <ExternalEventRow key={item.key} e={item.event} compact />
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Main Calendar View Container (Zero Scroll Full Screen Grid) */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex-1 flex flex-col">
            {/* View Mode Bar */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-950/60">
                <button
                  onClick={() => setViewMode("month")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    viewMode === "month"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Month View
                </button>
                <button
                  onClick={() => setViewMode("upcoming")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    viewMode === "upcoming"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Upcoming ({upcoming.length})
                </button>
                <button
                  onClick={() => setViewMode("past")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    viewMode === "past"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Past ({past.length})
                </button>
              </div>

              {/* Navigation Arrows for Month */}
              {viewMode === "month" && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                    {calendarMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() - 1); setCalendarMonth(d); }}
                      className="p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { const d = new Date(); d.setDate(1); setCalendarMonth(d); setSelectedDay(new Date()); }}
                      className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() + 1); setCalendarMonth(d); }}
                      className="p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Calendar Grid Mode */}
            {viewMode === "month" && (
              <CalendarGrid
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                meetingsByDay={meetingsByDay}
                externalByDay={externalByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            )}

            {/* List Modes */}
            {viewMode === "upcoming" && (
              <div className="p-4 space-y-4">
                {upcoming.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">No upcoming meetings scheduled.</div>
                ) : (
                  grouped.map(([day, items]) => (
                    <div key={day} className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{day}</h3>
                      <div className="space-y-2">
                        {items.map((m) => <MeetingRowItem key={m.id} m={m} onOpen={() => setDetail(m)} />)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {viewMode === "past" && (
              <div className="p-4 space-y-2">
                {past.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">No past meetings recorded.</div>
                ) : (
                  past.map((m) => <MeetingRowItem key={m.id} m={m} onOpen={() => setDetail(m)} past />)
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
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
          otherMeetings={meetings.filter((m) => m.status === "scheduled" && m.id !== (editing === "new" ? null : editing.id))}
          onClose={() => { setEditing(null); setPresetLeadIds([]); }}
        />
      )}
    </div>
  );
}

/** Mini Month Calendar Picker Widget for the Zoho Left Sidebar */
function MiniCalendar({
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
}) {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const days = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    const result: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      result.push(d);
    }
    return result;
  }, [month]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="font-bold text-xs text-slate-900 dark:text-white">
          {month.toLocaleDateString([], { month: "short", year: "numeric" })}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); onMonthChange(d); }}
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); onMonthChange(d); }}
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs">
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDay);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={cn(
                "h-6 w-6 rounded-lg flex items-center justify-center font-medium mx-auto transition-all text-[11px]",
                isSelected
                  ? "bg-blue-600 text-white font-bold shadow-sm"
                  : isToday
                  ? "bg-blue-50 dark:bg-blue-950/80 text-blue-600 font-bold border border-blue-200 dark:border-blue-800"
                  : inMonth
                  ? "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  : "text-slate-300 dark:text-slate-700"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MeetingRowItem({ m, onOpen, past, compact }: { m: MeetingRow; onOpen: () => void; past?: boolean; compact?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "w-full text-left flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 border-l-4 border-l-blue-600 dark:border-l-blue-500 bg-white dark:bg-slate-900 transition-all shadow-sm group",
        compact ? "p-2.5" : "p-3.5"
      )}
    >
      <div className={cn("rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 font-bold", compact ? "h-8 w-8 text-xs" : "h-10 w-10")}>
        <Video className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-slate-900 dark:text-white truncate text-xs sm:text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{m.title}</p>
          {m.status !== "scheduled" && <Badge variant={STATUS_VARIANT[m.status] || "default"}>{m.status}</Badge>}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-medium">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtRange(m.start_at, m.end_at)}</span>
          {leadLabel(m.lead) && <> · <span className="truncate">{leadLabel(m.lead)}</span></>}
        </p>
      </div>
      {!past && m.join_url && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg shadow-sm transition-all flex-shrink-0">
          <Video className="h-3 w-3" /> Join
        </span>
      )}
      {past && m.recording_url && <PlayCircle className="h-4 w-4 text-slate-400 flex-shrink-0" />}
    </button>
  );
}

function ExternalEventRow({ e, compact }: { e: SyncedCalendarEvent; compact?: boolean }) {
  const style = PROVIDER_STYLE[e.provider] || PROVIDER_STYLE.google;
  const body = (
    <div className={cn(
      "w-full text-left flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 border-l-4 bg-white dark:bg-slate-900 transition-all shadow-sm",
      compact ? "p-2.5" : "p-3.5",
      e.htmlLink ? "hover:bg-slate-50/50 dark:hover:bg-slate-800/40 cursor-pointer" : ""
    )}>
      <div className={cn("rounded-lg flex items-center justify-center flex-shrink-0", style.chip, compact ? "h-8 w-8" : "h-10 w-10")}>
        <CalendarDays className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-slate-900 dark:text-white truncate text-xs sm:text-sm">{e.title}</p>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.chip}`}>{style.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 font-medium">
          <Clock className="h-3 w-3" /> {e.allDay ? "All day" : fmtRange(e.start, e.end)}
        </p>
      </div>
      {e.htmlLink && <ExternalLink className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
    </div>
  );
  const dotClass = style.dot;
  return (
    <div className="relative">
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${dotClass}`} />
      {e.htmlLink ? (
        <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="block">
          {body}
        </a>
      ) : body}
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Zero-Scroll Zoho Calendar Month Grid */
function CalendarGrid({ month, onMonthChange, meetingsByDay, externalByDay, selectedDay, onSelectDay }: {
  month: Date;
  onMonthChange: (d: Date) => void;
  meetingsByDay: Map<string, MeetingRow[]>;
  externalByDay: Map<string, SyncedCalendarEvent[]>;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
}) {
  const today = new Date();
  const cells = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [month]);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return (
    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
      <div className="grid grid-cols-7 gap-1 flex-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 py-1.5 border-b border-slate-100 dark:border-slate-800">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const dayMeetings = meetingsByDay.get(dateKey(d)) ?? [];
          const dayExternal = externalByDay.get(dateKey(d)) ?? [];
          const totalCount = dayMeetings.length + dayExternal.length;
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDay);

          const chips = [
            ...dayMeetings.map((m) => ({ kind: "meeting" as const, start: m.start_at, title: m.title })),
            ...dayExternal.map((e) => ({ kind: "external" as const, start: e.start, title: e.title, provider: e.provider })),
          ].sort((a, b) => a.start.localeCompare(b.start));

          const visibleChips = chips.slice(0, 3);
          const overflow = chips.length - visibleChips.length;

          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={cn(
                "min-h-[96px] sm:min-h-[110px] rounded-xl flex flex-col items-stretch gap-1 text-xs transition-all p-2 text-left border border-slate-100/60 dark:border-slate-800/60",
                isSelected
                  ? "bg-blue-50/80 dark:bg-blue-950/60 border-blue-600 dark:border-blue-500 shadow-xs"
                  : isToday
                  ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
                  : inMonth
                  ? "hover:bg-slate-50 dark:hover:bg-slate-800/40 bg-white dark:bg-slate-900"
                  : "bg-slate-50/30 dark:bg-slate-950/40 text-slate-400 dark:text-slate-700"
              )}
            >
              <span className={cn(
                "self-start h-5 w-5 flex items-center justify-center rounded-full text-[11px] font-bold transition-all",
                isToday
                  ? "bg-blue-600 text-white shadow-xs"
                  : isSelected
                  ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold"
                  : inMonth
                  ? "text-slate-700 dark:text-slate-300"
                  : "text-slate-400 dark:text-slate-600"
              )}>
                {d.getDate()}
              </span>

              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                {visibleChips.map((c, i) => (
                  <span
                    key={i}
                    className={cn(
                      "truncate rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight border-l-2 transition-colors",
                      c.kind === "meeting"
                        ? "bg-blue-50 dark:bg-blue-950/80 border-l-blue-600 text-blue-900 dark:text-blue-200"
                        : `${(PROVIDER_STYLE[c.provider] || PROVIDER_STYLE.google).chip} border-l-2`
                    )}
                  >
                    {fmtTime(c.start)} {c.title}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] font-bold px-1 text-slate-400 dark:text-slate-500">+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({ m, pending, onClose, onEdit, onCancel, onDelete }: {
  m: MeetingRow; pending: boolean; onClose: () => void; onEdit: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{m.title}</h2>
              {m.status !== "scheduled" && <Badge variant={STATUS_VARIANT[m.status] || "default"}>{m.status}</Badge>}
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {new Date(m.start_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <Row icon={<Clock className="h-4 w-4" />} label="Time">{fmtRange(m.start_at, m.end_at)}</Row>
          {m.location && <Row icon={<MapPin className="h-4 w-4" />} label="Location">{m.location}</Row>}
          {m.lead && (
            <Row icon={<Link2 className="h-4 w-4" />} label="Contact">
              <Link href={`/leads/${m.lead.id}`} className="text-blue-600 dark:text-blue-400 font-bold hover:underline">{leadLabel(m.lead)}</Link>
            </Row>
          )}
          <Row icon={<Users className="h-4 w-4" />} label={`Attendees (${attendees.length})`}>
            {attendees.length === 0 ? <span className="text-slate-400">None added</span> : (
              <ul className="space-y-1">
                {attendees.map((a, i) => <li key={i} className="text-slate-700 dark:text-slate-300 font-medium">{a.name || a.email}{a.name && a.email ? ` · ${a.email}` : ""}</li>)}
              </ul>
            )}
          </Row>
          {m.description && <Row icon={<FileText className="h-4 w-4" />} label="Notes">{m.description}</Row>}
          {m.recording_url && <Row icon={<PlayCircle className="h-4 w-4" />} label="Recording"><a href={m.recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">View recording</a></Row>}
          {m.summary && <Row icon={<FileText className="h-4 w-4" />} label="Summary">{m.summary}</Row>}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-950/40">
          {m.join_url && (
            <a href={m.join_url} target="_blank" rel="noopener noreferrer">
              <Button className="w-full font-bold rounded-xl"><Video className="h-4 w-4" /> Join meeting <ExternalLink className="h-3.5 w-3.5 opacity-70" /></Button>
            </a>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={onEdit} disabled={pending}><Pencil className="h-4 w-4" /> Edit / reschedule</Button>
            {m.status === "scheduled" && <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={onCancel} disabled={pending}>Cancel</Button>}
          </div>
          <button onClick={onDelete} disabled={pending} className="w-full text-xs font-semibold text-slate-400 hover:text-rose-600 py-1 transition-colors">Delete meeting</button>
        </div>
      </aside>
    </>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="text-slate-700 dark:text-slate-300 mt-0.5 font-medium">{children}</div>
      </div>
    </div>
  );
}

interface Attendee { leadId?: string; name: string; email: string }

function MeetingFormModal({ meeting, leads, initialLeadIds = [], otherMeetings = [], onClose }: { meeting: MeetingRow | null; leads: LeadOption[]; initialLeadIds?: string[]; otherMeetings?: MeetingRow[]; onClose: () => void }) {
  const isEdit = !!meeting;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "review">("details");
  const [sendInvites, setSendInvites] = useState(true);
  const [nowMs] = useState(() => Date.now());

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

  const [avail, setAvail] = useState<{ busy: { start: string; end: string }[]; checked: boolean; loading: boolean; error?: string }>({ busy: [], checked: false, loading: false });
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (form.provider !== "google_meet" && form.provider !== "zoom") {
      set("join_url", generateConferenceLink(form.provider as ConferenceProvider));
      return;
    }
    setGenerating(true);
    setError(null);
    const input = {
      title: form.title || "Meeting",
      startIso: form.startLocal ? new Date(form.startLocal).toISOString() : new Date(nowMs).toISOString(),
      endIso: form.endLocal ? new Date(form.endLocal).toISOString() : new Date(nowMs + 30 * 60000).toISOString(),
      attendeeEmails: attendees.filter((a) => a.email).map((a) => a.email),
    };
    const res = form.provider === "google_meet" ? await createGoogleMeetLink(input) : await createZoomMeetingLink(input);
    setGenerating(false);
    if (res.ok) { set("join_url", res.joinUrl); return; }
    setError(res.error);
    set("join_url", generateConferenceLink(form.provider as ConferenceProvider));
  }

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

  const ownBusy = useMemo(() => otherMeetings.map((m) => ({ start: m.start_at, end: m.end_at })), [otherMeetings]);
  const allBusy = useMemo(() => [...ownBusy, ...avail.busy], [ownBusy, avail.busy]);

  const freeSlots = useMemo(() => {
    if (!avail.checked || !form.startLocal) return [];
    const day = new Date(form.startLocal); day.setHours(0, 0, 0, 0);
    const out: { startLocal: string; endLocal: string; label: string }[] = [];
    for (let h = 9; h < 18; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day); s.setHours(h, m, 0, 0);
        const e = new Date(s.getTime() + 30 * 60000);
        if (s.getTime() < nowMs) continue;
        if (allBusy.some((b) => new Date(b.start) < e && new Date(b.end) > s)) continue;
        out.push({ startLocal: toLocalInput(s.toISOString()), endLocal: toLocalInput(e.toISOString()), label: s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
      }
    }
    return out;
  }, [allBusy, avail.checked, form.startLocal, nowMs]);

  const conflict = useMemo(() => {
    if (!form.startLocal || !form.endLocal) return false;
    const s = new Date(form.startLocal), e = new Date(form.endLocal);
    return allBusy.some((b) => new Date(b.start) < e && new Date(b.end) > s);
  }, [allBusy, form.startLocal, form.endLocal]);

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
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        <Card className="w-full max-w-lg p-6 mt-12 pointer-events-auto rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isEdit ? "Edit / reschedule meeting" : step === "review" ? "Review & schedule" : "Schedule a meeting"}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          {step === "details" ? (
            <div className="space-y-4">
              <Field label="Title" required>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discovery call" className="rounded-xl" />
              </Field>

              <Field label={`Attendees${invitableCount ? ` (${invitableCount} will be invited)` : ""}`}>
                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attendees.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {a.name || a.email}{!a.email && <span className="text-amber-600" title="No email — won't get an invite">⚠</span>}
                        <button onClick={() => removeAttendee(i)} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Select value="" onChange={(e) => { if (e.target.value) addLeadAttendee(e.target.value); }} className="flex-1 rounded-xl">
                    <option value="">+ Add a lead…</option>
                    {leads.filter((l) => !attendees.some((a) => a.leadId === l.id)).map((l) => (
                      <option key={l.id} value={l.id}>{leadLabel(l)}{l.email ? "" : " (no email)"}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input className="flex-1 rounded-xl" placeholder="or add an email…" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualEmail(); } }} />
                  <Button type="button" variant="outline" onClick={addManualEmail} className="flex-shrink-0 rounded-xl"><UserPlus className="h-4 w-4" /> Add</Button>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Start" required><Input type="datetime-local" value={form.startLocal} onChange={(e) => set("startLocal", e.target.value)} className="rounded-xl" /></Field>
                <Field label="End" required><Input type="datetime-local" value={form.endLocal} onChange={(e) => set("endLocal", e.target.value)} className="rounded-xl" /></Field>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 uppercase tracking-wider"><CalendarCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Availability</span>
                  <Button type="button" variant="outline" size="sm" onClick={checkAvailability} disabled={avail.loading} className="rounded-xl text-xs font-bold">
                    {avail.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Check calendar
                  </Button>
                </div>
                {!avail.checked && conflict && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 font-medium"><AlertCircle className="h-3.5 w-3.5" /> Overlaps another meeting you have scheduled.</p>
                )}
                {avail.checked && (
                  <div className="mt-2 text-xs font-medium">
                    {avail.error ? (
                      <p className="text-slate-400">Calendar not connected — connect it in Settings → Calendar.</p>
                    ) : (
                      <>
                        {conflict && <p className="text-rose-600 dark:text-rose-400 mb-1.5 inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Overlaps a busy event on your calendar.</p>}
                        {!conflict && form.startLocal && <p className="text-blue-600 dark:text-blue-400 mb-1.5 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> You&apos;re free at the selected time.</p>}
                        {freeSlots.length > 0 && (
                          <>
                            <p className="text-slate-500 mb-1">Free slots that day:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {freeSlots.slice(0, 10).map((s) => (
                                <button key={s.startLocal} onClick={() => { set("startLocal", s.startLocal); set("endLocal", s.endLocal); }}
                                  className="rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:border-blue-500">
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
                  <Select value={form.provider} onChange={(e) => set("provider", e.target.value)} className="rounded-xl">
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </Field>
                <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room or address" className="rounded-xl" /></Field>
              </div>
              <Field label="Join link">
                <div className="flex gap-2">
                  <Input className="flex-1 rounded-xl" value={form.join_url} onChange={(e) => set("join_url", e.target.value)} placeholder="https://…" />
                  <Button type="button" variant="outline" onClick={handleGenerate} disabled={form.provider === "manual" || generating} className="flex-shrink-0 rounded-xl font-bold">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate
                  </Button>
                </div>
              </Field>
              <Field label="Notes"><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Agenda or context" className="rounded-xl" /></Field>
            </div>
          ) : (
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
                <label className="flex items-center gap-2 pt-2 text-slate-700 dark:text-slate-300 font-medium">
                  <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  Email an invite to {invitableCount} attendee{invitableCount === 1 ? "" : "s"}
                </label>
              )}
            </div>
          )}

          <div className="flex justify-between gap-2 mt-6">
            {step === "review"
              ? <Button variant="ghost" onClick={() => setStep("details")} disabled={pending} className="rounded-xl font-bold"><ChevronLeft className="h-4 w-4" /> Back</Button>
              : <Button variant="ghost" onClick={onClose} disabled={pending} className="rounded-xl font-bold">Cancel</Button>}
            {isEdit ? (
              <Button onClick={confirmSave} disabled={pending} className="rounded-xl font-bold">
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
              </Button>
            ) : step === "details" ? (
              <Button onClick={goReview} disabled={pending} className="rounded-xl font-bold">Review →</Button>
            ) : (
              <Button onClick={confirmSave} disabled={pending} className="rounded-xl font-bold">
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
      <span className="w-24 flex-shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pt-0.5">{label}</span>
      <div className="flex-1 text-slate-700 dark:text-slate-300 font-medium">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>
      {children}
    </div>
  );
}

const REGIONS = [
  { label: "Local Time (Auto)", zone: undefined },
  { label: "US Eastern (EST/EDT)", zone: "America/New_York" },
  { label: "US Pacific (PST/PDT)", zone: "America/Los_Angeles" },
  { label: "US Central (CST/CDT)", zone: "America/Chicago" },
  { label: "UK / London (GMT/BST)", zone: "Europe/London" },
  { label: "Central Europe (CET)", zone: "Europe/Paris" },
  { label: "Dubai (GST)", zone: "Asia/Dubai" },
  { label: "India (IST)", zone: "Asia/Kolkata" },
  { label: "Singapore (SGT)", zone: "Asia/Singapore" },
  { label: "Tokyo (JST)", zone: "Asia/Tokyo" },
  { label: "Sydney (AEST)", zone: "Australia/Sydney" },
];

function RegionClockWidget() {
  const [time, setTime] = useState<Date | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only clock init on mount, avoids an SSR/client time mismatch
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = useMemo(() => {
    if (!time) return "--:--:--";
    return time.toLocaleTimeString([], {
      timeZone: selectedZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }, [time, selectedZone]);

  const dateString = useMemo(() => {
    if (!time) return "";
    return time.toLocaleDateString([], {
      timeZone: selectedZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [time, selectedZone]);

  const tzAbbrev = useMemo(() => {
    if (!time) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: selectedZone }).formatToParts(time);
      return parts.find((p) => p.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  }, [time, selectedZone]);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Region Time
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
          {tzAbbrev || "LOCAL"}
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
          {timeString}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {dateString}
        </span>
      </div>

      <div>
        <select
          value={selectedZone || ""}
          onChange={(e) => setSelectedZone(e.target.value || undefined)}
          className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {REGIONS.map((r) => (
            <option key={r.label} value={r.zone || ""}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

