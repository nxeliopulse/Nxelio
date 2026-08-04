"use client";
import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Clock, Users, ExternalLink, Pencil, X, Plus, Link2, FileText,
  PlayCircle, Video, MapPin, AlertCircle, Loader2, Wand2,
  Send, Check, ChevronLeft, ChevronRight, UserPlus, CalendarCheck, RefreshCw,
  CheckSquare, Square, Globe, ArrowLeft,
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
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [viewMode, setViewMode] = useState<"month" | "upcoming" | "past">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [detail, setDetail] = useState<MeetingRow | null>(null);
  const [editing, setEditing] = useState<MeetingRow | "new" | null>(null);
  
  // Accountix Calendar Category Filters
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(["Meetings", "Tasks", "Calls", "Events", "Holidays"])
  );

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const getEventCategory = (item: { kind: "meeting" | "external"; title: string }) => {
    if (item.kind === "meeting") return "Meetings";
    const t = item.title.toLowerCase();
    if (t.includes("call") || t.includes("phone")) return "Calls";
    if (t.includes("retreat") || t.includes("happy") || t.includes("task") || t.includes("todo")) return "Tasks";
    if (t.includes("holiday") || t.includes("valentine") || t.includes("christmas") || t.includes("report")) return "Holidays";
    return "Events";
  };

  const getEventStyle = (cat: string) => {
    switch (cat) {
      case "Meetings": return "bg-blue-600 text-white";
      case "Tasks": return "bg-emerald-600 text-white";
      case "Calls": return "bg-cyan-600 text-white";
      case "Events": return "bg-purple-600 text-white";
      case "Holidays": return "bg-rose-600 text-white";
      default: return "bg-slate-600 text-white";
    }
  };

  const [presetLeadIds, setPresetLeadIds] = useState<string[]>([]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("leads");
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setPresetLeadIds(p.split(",").map((s) => s.trim()).filter(Boolean));
      setEditing("new");
    }
    // Deep-link into a specific meeting's Edit/Delete panel — used by the
    // Prospect Details page's meeting list, which previously had no way to
    // reach this panel at all (its rows weren't clickable).
    const openId = params.get("open");
    if (openId) {
      const found = meetings.find((m) => m.id === openId);
      if (found) setDetail(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time init from the URL on mount
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
    for (const e of external.events) {
      const k = dateKey(new Date(e.start));
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return map;
  }, [external.events]);

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

  const upcomingEventsList = useMemo(() => {
    const list: { title: string; start: string; timeLabel: string; kind: "meeting" | "external" }[] = [];
    upcoming.forEach((m) => {
      list.push({
        title: m.title,
        start: m.start_at,
        timeLabel: dayLabel(m.start_at) + " " + fmtTime(m.start_at),
        kind: "meeting",
      });
    });
    external.events.forEach((e) => {
      const isFuture = new Date(e.start).getTime() >= now;
      if (isFuture) {
        list.push({
          title: e.title,
          start: e.start,
          timeLabel: dayLabel(e.start) + " " + (e.allDay ? "All day" : fmtTime(e.start)),
          kind: "external",
        });
      }
    });
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list.filter((item) => activeCategories.has(getEventCategory(item))).slice(0, 5);
  }, [upcoming, external.events, now, activeCategories]);

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
    for (const m of meetings) {
      const k = dateKey(new Date(m.start_at));
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return map;
  }, [meetings]);

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
    <div className="max-w-[1600px] mx-auto space-y-6">
      {presetLeadIds.length === 1 && (
        <Link
          href={`/leads/${presetLeadIds[0]}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Prospect Details
        </Link>
      )}

      {/* Zero-Scroll Two-Column Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        
        {/* Left Column Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-6">
          {/* Card 1: Mini Calendar */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <MiniCalendar
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>

          {/* Card 2: My Calendars (Checkboxes) */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">My Calendars</h3>
            <div className="space-y-3 text-xs font-semibold">
              {[
                { name: "Meetings", color: "bg-blue-600", border: "border-blue-600 text-blue-600" },
                { name: "Tasks", color: "bg-emerald-600", border: "border-emerald-600 text-emerald-600" },
                { name: "Calls", color: "bg-cyan-600", border: "border-cyan-600 text-cyan-600" },
                { name: "Events", color: "bg-purple-600", border: "border-purple-600 text-purple-600" },
                { name: "Holidays", color: "bg-rose-600", border: "border-rose-600 text-rose-600" },
              ].map((cat) => {
                const active = activeCategories.has(cat.name);
                return (
                  <button
                    key={cat.name}
                    onClick={() => toggleCategory(cat.name)}
                    className="w-full flex items-center gap-3 text-left hover:opacity-85 transition-opacity"
                  >
                    <div className={cn(
                      "h-4 w-4 rounded flex items-center justify-center border transition-all",
                      active ? `${cat.color} border-transparent text-white` : "border-slate-300 text-transparent"
                    )}>
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <span className="text-slate-700 dark:text-slate-600 font-bold">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3: Upcoming Events */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 flex flex-col min-h-[280px]">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Upcoming Events</h3>
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {upcomingEventsList.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No upcoming events.</p>
              ) : (
                upcomingEventsList.map((evt, idx) => {
                  const cat = getEventCategory(evt);
                  const colorClass = getEventStyle(cat).split(" ")[0]; // e.g. bg-blue-600
                  return (
                    <div key={idx} className="flex items-start gap-3 text-xs">
                      <span className={cn("h-2.5 w-2.5 rounded-full mt-1 shrink-0", colorClass)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 dark:text-slate-700 truncate">{evt.title}</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">{evt.timeLabel}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Main Column */}
        <div className="flex-1 flex flex-col space-y-6">
          {/* Header Controls Area */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Calendar</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500 mt-0.5">
                {calendarMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Navigation group */}
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900">
                <button
                  onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() - 1); setCalendarMonth(d); }}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { const d = new Date(); d.setDate(1); setCalendarMonth(d); setSelectedDay(new Date()); }}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-x border-slate-200 dark:border-slate-800"
                >
                  Today
                </button>
                <button
                  onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() + 1); setCalendarMonth(d); }}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* View toggle group */}
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900">
                <button
                  onClick={() => setViewMode("month")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    viewMode === "month"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode("upcoming")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border-x border-slate-200 dark:border-slate-800",
                    viewMode === "upcoming"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => setViewMode("past")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                    viewMode === "past"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Past
                </button>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  toast("Refreshing calendar...", "info");
                  router.refresh();
                  setTimeout(() => window.location.reload(), 100);
                }}
                className="h-9 w-9 p-0 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 text-slate-500" />
              </Button>

              {/* Add event button */}
              <Button
                onClick={() => setEditing("new")}
                className="rounded-xl font-bold px-4 py-2 text-xs sm:text-sm gap-2"
              >
                <Plus className="h-4 w-4" /> Add Event
              </Button>
            </div>
          </div>

          {/* Calendar Area */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex-1 flex flex-col min-h-[600px]">
            {viewMode === "month" && (
              <CalendarGrid
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                meetingsByDay={meetingsByDay}
                externalByDay={externalByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                activeCategories={activeCategories}
                getEventCategory={getEventCategory}
                getEventStyle={getEventStyle}
              />
            )}

            {viewMode === "upcoming" && (
              <div className="p-5 space-y-5 overflow-y-auto">
                {upcoming.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">No upcoming meetings scheduled.</div>
                ) : (
                  grouped.map(([day, items]) => (
                    <div key={day} className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{day}</h3>
                      <div className="space-y-2.5">
                        {items.map((m) => <MeetingRowItem key={m.id} m={m} onOpen={() => setDetail(m)} />)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {viewMode === "past" && (
              <div className="p-5 space-y-2.5 overflow-y-auto">
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
    <div className="space-y-4">
      {/* Header with Month Title and arrows on edges */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); onMonthChange(d); }}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm text-slate-800">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); onMonthChange(d); }}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>

      {/* Grid of days */}
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
                "h-7 w-7 rounded-full flex items-center justify-center font-semibold mx-auto transition-all text-xs relative",
                isSelected
                  ? "bg-indigo-600 text-white font-bold shadow-sm"
                  : isToday
                  ? "bg-indigo-50 text-indigo-600 font-bold border border-indigo-200"
                  : inMonth
                  ? "text-slate-600 hover:bg-slate-100"
                  : "text-slate-300"
              )}
            >
              {d.getDate()}
              {inMonth && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-slate-300" />
              )}
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
        <p className="text-[11px] text-slate-500 dark:text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium">
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
      e.htmlLink ? "hover:bg-slate-50/50 dark:hover:bg-[var(--muted)] cursor-pointer" : ""
    )}>
      <div className={cn("rounded-lg flex items-center justify-center flex-shrink-0", style.chip, compact ? "h-8 w-8" : "h-10 w-10")}>
        <CalendarDays className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-slate-900 dark:text-white truncate text-xs sm:text-sm">{e.title}</p>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.chip}`}>{style.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
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

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function CalendarGrid({
  month,
  onMonthChange,
  meetingsByDay,
  externalByDay,
  selectedDay,
  onSelectDay,
  activeCategories,
  getEventCategory,
  getEventStyle,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  meetingsByDay: Map<string, MeetingRow[]>;
  externalByDay: Map<string, SyncedCalendarEvent[]>;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  activeCategories: Set<string>;
  getEventCategory: (item: { kind: "meeting" | "external"; title: string }) => string;
  getEventStyle: (cat: string) => string;
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
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-800 gap-px p-4 sm:p-5">
      {/* Weekday headers row */}
      <div className="grid grid-cols-7 bg-white dark:bg-slate-900">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-xs font-bold tracking-wider text-slate-400 py-3 border-b border-slate-100 dark:border-slate-800">
            {w}
          </div>
        ))}
      </div>
      
      {/* 6-row Day grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 flex-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const dayMeetings = meetingsByDay.get(dateKey(d)) ?? [];
          const dayExternal = externalByDay.get(dateKey(d)) ?? [];
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDay);

          const chips = [
            ...dayMeetings.map((m) => ({ kind: "meeting" as const, start: m.start_at, title: m.title, allDay: false })),
            ...dayExternal.map((e) => ({ kind: "external" as const, start: e.start, title: e.title, provider: e.provider, allDay: e.allDay })),
          ]
            .filter((c) => activeCategories.has(getEventCategory(c)))
            .sort((a, b) => a.start.localeCompare(b.start));

          const visibleChips = chips.slice(0, 3);
          const overflow = chips.length - visibleChips.length;

          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={cn(
                "min-h-[110px] bg-white dark:bg-slate-900 flex flex-col items-stretch gap-1.5 p-2 text-left relative transition-all",
                isSelected ? "ring-2 ring-indigo-600 ring-inset z-10" : "hover:bg-slate-50/50"
              )}
            >
              <span className={cn(
                "h-5 w-5 flex items-center justify-center rounded-full text-xs font-semibold",
                isToday
                  ? "bg-indigo-600 text-white shadow-xs font-bold"
                  : isSelected
                  ? "text-indigo-600 font-bold"
                  : inMonth
                  ? "text-slate-700 dark:text-slate-600"
                  : "text-slate-300 dark:text-slate-700"
              )}>
                {d.getDate()}
              </span>

              <div className="flex flex-col gap-1 min-w-0 flex-1 overflow-hidden">
                {visibleChips.map((c, i) => {
                  const cat = getEventCategory(c);
                  const styleClass = getEventStyle(cat);
                  return (
                    <span
                      key={i}
                      className={cn(
                        "truncate rounded px-1.5 py-1 text-[9px] font-bold leading-none block w-full",
                        styleClass
                      )}
                    >
                      {c.allDay ? "" : fmtTime(c.start)} {c.title}
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[9px] font-bold px-1 text-slate-400 dark:border-slate-500">+{overflow} more</span>
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
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {new Date(m.start_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"><X className="h-4 w-4" /></button>
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
                {attendees.map((a, i) => <li key={i} className="text-slate-700 dark:text-slate-600 font-medium">{a.name || a.email}{a.name && a.email ? ` · ${a.email}` : ""}</li>)}
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
        <div className="text-slate-700 dark:text-slate-600 mt-0.5 font-medium">{children}</div>
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
    // Only clear the input once the email is actually added — previously this
    // cleared unconditionally, so re-adding an email already on the attendee
    // list (e.g. the lead this meeting was scheduled from) silently wiped the
    // typed text with no visible attendee added and no explanation why.
    if (attendees.some((x) => x.email.toLowerCase() === e.toLowerCase())) {
      setError("That email is already an attendee.");
      return;
    }
    setAttendees((a) => [...a, { name: "", email: e }]);
    setManualEmail("");
  }
  const removeAttendee = (i: number) => setAttendees((a) => a.filter((_, idx) => idx !== i));
  const invitableCount = attendees.filter((a) => a.email).length;

  const [avail, setAvail] = useState<{ busy: { start: string; end: string }[]; checked: boolean; loading: boolean; error?: string }>({ busy: [], checked: false, loading: false });
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setError(null);
    if (form.provider !== "google_meet" && form.provider !== "zoom") {
      set("join_url", generateConferenceLink(form.provider as ConferenceProvider));
      return;
    }
    setGenerating(true);
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
        <Card className="w-full max-w-2xl p-5 mt-4 pointer-events-auto rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isEdit ? "Edit / reschedule meeting" : step === "review" ? "Review & schedule" : "Schedule a meeting"}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"><X className="h-4 w-4" /></button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-700 dark:text-red-300 mb-3">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          {step === "details" ? (
            <div className="space-y-3">
              <Field label="Title" required>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discovery call" className="rounded-xl" />
              </Field>

              <Field label={`Attendees${invitableCount ? ` (${invitableCount} will be invited)` : ""}`}>
                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {attendees.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-[var(--muted)] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-600">
                        {a.name || a.email}{!a.email && <span className="text-amber-600" title="No email — won't get an invite">⚠</span>}
                        <button onClick={() => removeAttendee(i)} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select value="" onChange={(e) => { if (e.target.value) addLeadAttendee(e.target.value); }} className="rounded-xl">
                    <option value="">+ Add a lead…</option>
                    {leads.filter((l) => !attendees.some((a) => a.leadId === l.id)).map((l) => (
                      <option key={l.id} value={l.id}>{leadLabel(l)}{l.email ? "" : " (no email)"}</option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Input className="flex-1 rounded-xl" placeholder="or add an email…" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualEmail(); } }} />
                    <Button type="button" variant="outline" onClick={addManualEmail} className="flex-shrink-0 rounded-xl"><UserPlus className="h-4 w-4" /> Add</Button>
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Start" required><Input type="datetime-local" value={form.startLocal} onChange={(e) => set("startLocal", e.target.value)} className="rounded-xl" /></Field>
                <Field label="End" required><Input type="datetime-local" value={form.endLocal} onChange={(e) => set("endLocal", e.target.value)} className="rounded-xl" /></Field>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-600 inline-flex items-center gap-1.5 uppercase tracking-wider"><CalendarCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Availability</span>
                  <Button type="button" variant="outline" size="sm" onClick={checkAvailability} disabled={avail.loading} className="rounded-xl text-xs font-bold h-7 px-2.5">
                    {avail.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Check calendar
                  </Button>
                </div>
                {!avail.checked && conflict && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 font-medium"><AlertCircle className="h-3.5 w-3.5" /> Overlaps another meeting you have scheduled.</p>
                )}
                {avail.checked && (
                  <div className="mt-1 text-xs font-medium">
                    {avail.error ? (
                      <p className="text-slate-400">Calendar not connected — connect it in Settings → Calendar.</p>
                    ) : (
                      <>
                        {conflict && <p className="text-rose-600 dark:text-rose-400 mb-1 inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Overlaps a busy event on your calendar.</p>}
                        {!conflict && form.startLocal && <p className="text-blue-600 dark:text-blue-400 mb-1 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> You&apos;re free at the selected time.</p>}
                        {freeSlots.length > 0 && (
                          <>
                            <p className="text-slate-500 mb-1">Free slots that day:</p>
                            <div className="flex flex-wrap gap-1">
                              {freeSlots.slice(0, 10).map((s) => (
                                <button key={s.startLocal} onClick={() => { set("startLocal", s.startLocal); set("endLocal", s.endLocal); }}
                                  className="rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:border-blue-500">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Conferencing">
                  <Select value={form.provider} onChange={(e) => set("provider", e.target.value)} className="rounded-xl">
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </Field>
                <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room or address" className="rounded-xl" /></Field>
                <Field label="Join link">
                  <div className="flex gap-1.5">
                    <Input className="flex-1 rounded-xl" value={form.join_url} onChange={(e) => set("join_url", e.target.value)} placeholder="https://…" />
                    <Button type="button" variant="outline" onClick={handleGenerate} disabled={form.provider === "manual" || generating} className="flex-shrink-0 rounded-xl font-bold px-2.5 h-9">
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
              </div>

              <Field label="Notes"><Textarea rows={1} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Agenda or context" className="rounded-xl" /></Field>
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
                <label className="flex items-center gap-2 pt-2 text-slate-700 dark:text-slate-600 font-medium">
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
      <div className="flex-1 text-slate-700 dark:text-slate-600 font-medium">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-600 uppercase tracking-wider mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>
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
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-[var(--muted)] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 inline-flex items-center gap-1.5">
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
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-500">
          {dateString}
        </span>
      </div>

      <div>
        <select
          value={selectedZone || ""}
          onChange={(e) => setSelectedZone(e.target.value || undefined)}
          className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

