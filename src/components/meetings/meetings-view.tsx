"use client";
import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Clock, Users, ExternalLink, Pencil, X, Plus, Link2, FileText,
  PlayCircle, Video, MapPin, AlertCircle, Loader2, Wand2,
  Send, Check, ChevronLeft, ChevronRight, ChevronDown, UserPlus, CalendarCheck, RefreshCw,
  CheckSquare, Square, Globe, ArrowLeft, Search, Settings, Printer, MoreVertical, Download,
} from "lucide-react";
import { generateConferenceLink, type ConferenceProvider } from "@/lib/meetings/conference-link";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
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
function fmtTimeWithFormat(iso: string, format: "12" | "24") {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: format === "12" });
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

type ViewMode = "day" | "week" | "work" | "month" | "twoMonths" | "threeMonths" | "year" | "agenda" | "custom" | "past";

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Day",
  week: "Week",
  work: "Work",
  month: "Month",
  twoMonths: "2 Months",
  threeMonths: "3 Months",
  year: "Year",
  agenda: "Agenda",
  custom: "Custom Range",
  past: "Past",
};

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Shared "Mon 12" – "Fri 16" style label for any contiguous day range (week/work/custom). */
function rangeLabel(days: Date[]) {
  if (days.length === 0) return "";
  const first = days[0], last = days[days.length - 1];
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${first.toLocaleDateString([], { month: "short", day: "numeric" })} – ${last.toLocaleDateString([], { day: "numeric", year: "numeric" })}`;
  }
  return `${first.toLocaleDateString([], { month: "short", day: "numeric" })} – ${last.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

export function MeetingsView({ meetings, leads, userEmail }: { meetings: MeetingRow[]; leads: LeadOption[]; userEmail: string }) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  // Zoho-style single dropdown trigger for the view switcher, replacing the row of toggle buttons.
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [viewMenuPos, setViewMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Custom Range view — user-picked start/end dates, rendered as a day-by-day grid like Week view.
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Zoho-style sidebar: live search over real meetings, a collapsible calendar-filter list,
  // and the browser's actual IANA timezone (not a hardcoded label).
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [calendarsOpen, setCalendarsOpen] = useState(true);
  const timezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; }
  }, []);
  // "More options" (⋮) menu — same anchored-popover pattern as the view dropdown above.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Print calendars — Zoho-style settings-plus-live-preview dialog.
  const [printOpen, setPrintOpen] = useState(false);
  const [printCategories, setPrintCategories] = useState<Set<string>>(new Set(["Meetings", "Tasks", "Calls", "Events", "Holidays"]));
  const [printShowNames, setPrintShowNames] = useState(true);
  const [printView, setPrintView] = useState<"day" | "week" | "work" | "month" | "agenda">("agenda");
  const [printShowLocation, setPrintShowLocation] = useState(false);
  const [printCompact, setPrintCompact] = useState(false);
  const [printStart, setPrintStart] = useState("");
  const [printEnd, setPrintEnd] = useState("");
  const [printTimeFormat, setPrintTimeFormat] = useState<"12" | "24">("12");
  // Zoho's dialog has "Show declined events" — we don't track RSVP declines, so this
  // toggles our real equivalent (canceled meetings) instead of faking that field.
  const [printShowCanceled, setPrintShowCanceled] = useState(true);
  const [printLayout, setPrintLayout] = useState<"landscape" | "portrait">("landscape");
  const [printFontSize, setPrintFontSize] = useState<"small" | "medium" | "large">("medium");
  const [printColorStyle, setPrintColorStyle] = useState<"default" | "dark">("default");

  /** Exports every loaded meeting as CSV — same pattern used for Account/Contact export. */
  function handleExportCsv() {
    setMoreMenuOpen(false);
    toast("Exporting as CSV…", "info");
    const rows = [
      ["Title", "Start", "End", "Status", "Lead"],
      ...meetings.map((m) => [
        m.title,
        new Date(m.start_at).toLocaleString(),
        new Date(m.end_at).toLocaleString(),
        m.status,
        leadLabel(m.lead) || "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meetings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
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

  // Week (Sun-Sat) containing selectedDay — the anchor for the Week view.
  const weekStart = useMemo(() => {
    const d = new Date(selectedDay);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [selectedDay]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; }),
    [weekStart]
  );
  const workDays = useMemo(() => weekDays.slice(1, 6), [weekDays]); // Mon–Fri

  const customDays = useMemo(() => {
    if (!customStart || !customEnd) return [];
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
    const days: Date[] = [];
    const cur = new Date(start);
    while (cur <= end && days.length < 31) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [customStart, customEnd]);
  // Capped at 31 days above (a full grid column per day beyond that stops being readable) —
  // this tracks the raw span so the UI can say so instead of silently truncating.
  const customRangeSpanDays = useMemo(() => {
    if (!customStart || !customEnd) return 0;
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [customStart, customEnd]);

  /** Prev/next/Today navigate by month, week, or day depending on which view is active — both keep
   *  calendarMonth (the external-events fetch window) and selectedDay (the week anchor) in sync. */
  function goToday() {
    const d = new Date();
    d.setDate(1);
    setCalendarMonth(d);
    setSelectedDay(new Date());
  }
  function goPrev() {
    if (viewMode === "week" || viewMode === "work") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() - 7);
      setSelectedDay(d);
      if (d.getMonth() !== calendarMonth.getMonth() || d.getFullYear() !== calendarMonth.getFullYear()) {
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      return;
    }
    if (viewMode === "day") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() - 1);
      setSelectedDay(d);
      if (d.getMonth() !== calendarMonth.getMonth() || d.getFullYear() !== calendarMonth.getFullYear()) {
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      return;
    }
    const monthsBack = viewMode === "year" ? 12 : viewMode === "threeMonths" ? 3 : viewMode === "twoMonths" ? 2 : 1;
    setCalendarMonth(addMonths(calendarMonth, -monthsBack));
  }
  function goNext() {
    if (viewMode === "week" || viewMode === "work") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() + 7);
      setSelectedDay(d);
      if (d.getMonth() !== calendarMonth.getMonth() || d.getFullYear() !== calendarMonth.getFullYear()) {
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      return;
    }
    if (viewMode === "day") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() + 1);
      setSelectedDay(d);
      if (d.getMonth() !== calendarMonth.getMonth() || d.getFullYear() !== calendarMonth.getFullYear()) {
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      return;
    }
    const monthsFwd = viewMode === "year" ? 12 : viewMode === "threeMonths" ? 3 : viewMode === "twoMonths" ? 2 : 1;
    setCalendarMonth(addMonths(calendarMonth, monthsFwd));
  }

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

  const sidebarSearchResults = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return [];
    return meetings
      .filter((m) => m.title.toLowerCase().includes(q))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 8);
  }, [meetings, sidebarSearch]);

  /** Each Calendar View choice in the Print dialog auto-fills a sensible date range — still editable by hand after. */
  function applyPrintViewRange(view: "day" | "week" | "work" | "month" | "agenda") {
    setPrintView(view);
    if (view === "day") { setPrintStart(dateKey(selectedDay)); setPrintEnd(dateKey(selectedDay)); return; }
    if (view === "week") { setPrintStart(dateKey(weekDays[0])); setPrintEnd(dateKey(weekDays[6])); return; }
    if (view === "work") { setPrintStart(dateKey(workDays[0])); setPrintEnd(dateKey(workDays[workDays.length - 1])); return; }
    if (view === "month") {
      const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const last = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
      setPrintStart(dateKey(first));
      setPrintEnd(dateKey(last));
      return;
    }
    // agenda — default to the next 7 days
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 6);
    setPrintStart(dateKey(new Date()));
    setPrintEnd(dateKey(weekFromNow));
  }

  function openPrintModal() {
    setPrintCategories(new Set(activeCategories));
    const initialView = viewMode === "day" || viewMode === "week" || viewMode === "work" || viewMode === "month" ? viewMode : "agenda";
    applyPrintViewRange(initialView);
    setPrintOpen(true);
  }

  const printDays = useMemo(() => {
    if (!printStart || !printEnd) return [];
    const s = new Date(printStart);
    const e = new Date(printEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return [];
    const days: Date[] = [];
    const cur = new Date(s);
    while (cur <= e && days.length < 62) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
  }, [printStart, printEnd]);

  const printGroups = useMemo(() => {
    const groups: { day: Date; items: MeetingRow[] }[] = [];
    for (const d of printDays) {
      const dayMeetings = (meetingsByDay.get(dateKey(d)) ?? [])
        .filter((m) => printCategories.has(getEventCategory({ kind: "meeting", title: m.title })))
        .filter((m) => printShowCanceled || m.status !== "canceled");
      if (dayMeetings.length > 0) groups.push({ day: d, items: dayMeetings });
    }
    return groups;
  }, [printDays, meetingsByDay, printCategories, printShowCanceled]);

  const printEventCount = useMemo(() => printGroups.reduce((n, g) => n + g.items.length, 0), [printGroups]);

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
          {/* Zoho-style dark panel: New Event, search, account, calendars, mini calendar, timezone.
              Kept permanently dark (not theme-linked) to match Zoho's own fixed navy sidebar chrome. */}
          <div className="rounded-2xl bg-[#1a1f2e] p-5 shadow-sm space-y-5">
            <Button
              onClick={() => setEditing("new")}
              className="w-full justify-center rounded-xl font-bold text-sm py-2.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4" /> New Event
            </Button>

            {/* Search — filters your real meetings by title, click a result to open it */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search calendar"
                className="w-full rounded-lg bg-white/10 border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
              {sidebarSearch.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl max-h-64 overflow-y-auto">
                  {sidebarSearchResults.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">No matching meetings.</p>
                  ) : (
                    sidebarSearchResults.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setDetail(m); setSidebarSearch(""); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        {m.title}
                        <span className="block text-[10px] text-slate-400 font-normal mt-0.5">{fmtRange(m.start_at, m.end_at)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Account row — your real email; gear links to Settings */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-blue-400 truncate" title={userEmail}>{userEmail.toUpperCase()}</span>
              <Link
                href="/settings"
                title="Calendar settings"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* My Calendars — real category filters (title-keyword based), collapsible */}
            <div className="space-y-3">
              <button
                onClick={() => setCalendarsOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-300 w-full"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !calendarsOpen && "-rotate-90")} />
                My Calendars
              </button>
              {calendarsOpen && (
                <div className="space-y-2.5 pl-1">
                  {[
                    { name: "Meetings", color: "bg-blue-500" },
                    { name: "Tasks", color: "bg-emerald-500" },
                    { name: "Calls", color: "bg-cyan-500" },
                    { name: "Events", color: "bg-purple-500" },
                    { name: "Holidays", color: "bg-rose-500" },
                  ].map((cat) => {
                    const active = activeCategories.has(cat.name);
                    return (
                      <button
                        key={cat.name}
                        onClick={() => toggleCategory(cat.name)}
                        className="w-full flex items-center gap-2.5 text-left hover:opacity-85 transition-opacity"
                      >
                        <div className={cn(
                          "h-4 w-4 rounded-full flex items-center justify-center transition-all",
                          active ? `${cat.color} text-white` : "border border-slate-600 text-transparent"
                        )}>
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                        <span className="text-xs font-semibold text-slate-300">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <MiniCalendar
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />

            {timezone && <p className="text-xs font-semibold text-blue-400 text-center">{timezone}</p>}
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
                {viewMode === "day"
                  ? selectedDay.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                  : viewMode === "week"
                  ? rangeLabel(weekDays)
                  : viewMode === "work"
                  ? rangeLabel(workDays)
                  : viewMode === "twoMonths"
                  ? `${calendarMonth.toLocaleDateString([], { month: "short" })} – ${addMonths(calendarMonth, 1).toLocaleDateString([], { month: "short", year: "numeric" })}`
                  : viewMode === "threeMonths"
                  ? `${calendarMonth.toLocaleDateString([], { month: "short" })} – ${addMonths(calendarMonth, 2).toLocaleDateString([], { month: "short", year: "numeric" })}`
                  : viewMode === "year"
                  ? `${calendarMonth.getFullYear()}`
                  : viewMode === "agenda"
                  ? "Upcoming meetings"
                  : viewMode === "past"
                  ? "Past meetings"
                  : viewMode === "custom"
                  ? (customDays.length > 0 ? rangeLabel(customDays) : "Pick a date range")
                  : calendarMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Navigation group — hidden for views that aren't a fixed date window (Agenda/Past/Custom pick their own range) */}
              {viewMode !== "agenda" && viewMode !== "past" && viewMode !== "custom" && (
                <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900">
                  <button
                    onClick={goPrev}
                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={goToday}
                    className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-x border-slate-200 dark:border-slate-800"
                  >
                    Today
                  </button>
                  <button
                    onClick={goNext}
                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* View dropdown — one trigger button that opens a menu, like Zoho's view switcher */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setViewMenuPos({ top: r.bottom + 6, left: r.left });
                    setViewMenuOpen((v) => !v);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] transition-colors"
                >
                  {VIEW_LABELS[viewMode]}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", viewMenuOpen && "rotate-180")} />
                </button>

                {viewMenuOpen && viewMenuPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
                    <div
                      className="fixed z-50 w-44 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5"
                      style={{ top: viewMenuPos.top, left: viewMenuPos.left }}
                    >
                      {(["day", "week", "work", "month", "twoMonths", "threeMonths", "year", "agenda"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setViewMode(mode);
                            setViewMenuOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                            viewMode === mode
                              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                              : "text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                          )}
                        >
                          {VIEW_LABELS[mode]}
                        </button>
                      ))}

                      <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        onClick={() => { setViewMode("custom"); setViewMenuOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          viewMode === "custom"
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                            : "text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                        )}
                      >
                        Custom Range
                      </button>

                      {/* Not part of Zoho's list — our own existing "Past meetings" view, kept as a bonus item */}
                      <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        onClick={() => { setViewMode("past"); setViewMenuOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          viewMode === "past"
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                            : "text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                        )}
                      >
                        Past
                      </button>
                    </div>
                  </>
                )}
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

              {/* Print — opens the Print Calendars settings + live preview dialog */}
              <Button
                variant="outline"
                size="sm"
                onClick={openPrintModal}
                className="h-9 w-9 p-0 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                title="Print"
              >
                <Printer className="h-4 w-4 text-slate-500" />
              </Button>

              {/* More options (⋮) */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMoreMenuPos({ top: r.bottom + 6, left: r.right - 176 });
                    setMoreMenuOpen((v) => !v);
                  }}
                  className="h-9 w-9 p-0 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  title="More options"
                >
                  <MoreVertical className="h-4 w-4 text-slate-500" />
                </Button>

                {moreMenuOpen && moreMenuPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                    <div
                      className="fixed z-50 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5"
                      style={{ top: moreMenuPos.top, left: moreMenuPos.left }}
                    >
                      <button
                        onClick={handleExportCsv}
                        className="w-full flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                      >
                        <Download className="h-3.5 w-3.5" /> Export as CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Area */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex-1 flex flex-col min-h-[600px]">
            {viewMode === "day" && (
              <WeekGrid
                weekDays={[selectedDay]}
                meetingsByDay={meetingsByDay}
                externalByDay={externalByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onOpenMeeting={setDetail}
                activeCategories={activeCategories}
                getEventCategory={getEventCategory}
                getEventStyle={getEventStyle}
              />
            )}

            {viewMode === "week" && (
              <WeekGrid
                weekDays={weekDays}
                meetingsByDay={meetingsByDay}
                externalByDay={externalByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onOpenMeeting={setDetail}
                activeCategories={activeCategories}
                getEventCategory={getEventCategory}
                getEventStyle={getEventStyle}
              />
            )}

            {viewMode === "work" && (
              <WeekGrid
                weekDays={workDays}
                meetingsByDay={meetingsByDay}
                externalByDay={externalByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onOpenMeeting={setDetail}
                activeCategories={activeCategories}
                getEventCategory={getEventCategory}
                getEventStyle={getEventStyle}
              />
            )}

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

            {(viewMode === "twoMonths" || viewMode === "threeMonths") && (
              <div className={cn(
                "grid gap-4 p-4 overflow-y-auto",
                viewMode === "twoMonths" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              )}>
                {Array.from({ length: viewMode === "twoMonths" ? 2 : 3 }, (_, i) => addMonths(calendarMonth, i)).map((m) => (
                  <MiniMonthCard
                    key={m.toISOString()}
                    month={m}
                    selectedDay={selectedDay}
                    onSelectDay={(d) => { setSelectedDay(d); setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                    meetingsByDay={meetingsByDay}
                    externalByDay={externalByDay}
                  />
                ))}
              </div>
            )}

            {viewMode === "year" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto">
                {Array.from({ length: 12 }, (_, i) => new Date(calendarMonth.getFullYear(), i, 1)).map((m) => (
                  <MiniMonthCard
                    key={m.toISOString()}
                    month={m}
                    selectedDay={selectedDay}
                    onSelectDay={(d) => { setSelectedDay(d); setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                    meetingsByDay={meetingsByDay}
                    externalByDay={externalByDay}
                  />
                ))}
              </div>
            )}

            {viewMode === "agenda" && (
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

            {viewMode === "custom" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex flex-wrap items-end gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">From</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">To</label>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart || undefined}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600"
                    />
                  </div>
                </div>
                {customDays.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">
                    {customStart && customEnd && customRangeSpanDays <= 0
                      ? "End date must be on or after the start date."
                      : "Pick a start and end date to see your calendar for that range."}
                  </div>
                ) : (
                  <>
                    {customRangeSpanDays > 31 && (
                      <p className="px-4 pt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Showing the first 31 days of your {customRangeSpanDays}-day range.
                      </p>
                    )}
                    <WeekGrid
                      weekDays={customDays}
                      meetingsByDay={meetingsByDay}
                      externalByDay={externalByDay}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                      onOpenMeeting={setDetail}
                      activeCategories={activeCategories}
                      getEventCategory={getEventCategory}
                      getEventStyle={getEventStyle}
                    />
                  </>
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

      {/* Print calendars — Zoho-style settings panel + live preview. Only #meetingsPrintRoot
          is visible when window.print() actually fires (see the injected @media print rules). */}
      <Modal open={printOpen} onClose={() => setPrintOpen(false)} title="Print calendars" size="xl">
        <style>{`
          @page { size: ${printLayout}; margin: 12mm; }
          @media print {
            body * { visibility: hidden !important; }
            #meetingsPrintRoot, #meetingsPrintRoot * { visibility: visible !important; }
            #meetingsPrintRoot { position: fixed; inset: 0; padding: 12px; }
          }
        `}</style>
        <div className="flex flex-col h-[75vh]">
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Settings panel */}
            <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 overflow-y-auto p-4 space-y-5 text-xs">
              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Calendars</p>
                <div className="space-y-1.5">
                  {[
                    { name: "Meetings", color: "bg-blue-500" },
                    { name: "Tasks", color: "bg-emerald-500" },
                    { name: "Calls", color: "bg-cyan-500" },
                    { name: "Events", color: "bg-purple-500" },
                    { name: "Holidays", color: "bg-rose-500" },
                  ].map((cat) => {
                    const active = printCategories.has(cat.name);
                    return (
                      <label key={cat.name} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => setPrintCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat.name)) next.delete(cat.name); else next.add(cat.name);
                            return next;
                          })}
                          className="rounded"
                        />
                        <span className={cn("h-2 w-2 rounded-full flex-shrink-0", cat.color)} />
                        <span className="font-semibold text-slate-700 dark:text-slate-600">{cat.name}</span>
                      </label>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={printShowNames} onChange={(e) => setPrintShowNames(e.target.checked)} className="rounded" />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Show calendar names</span>
                </label>
              </div>

              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Calendar Settings</p>
                <label className="block font-semibold text-slate-500 mb-1">Calendar view</label>
                <select
                  value={printView}
                  onChange={(e) => applyPrintViewRange(e.target.value as "day" | "week" | "work" | "month" | "agenda")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 mb-3"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="work">Work</option>
                  <option value="month">Month</option>
                  <option value="agenda">Agenda</option>
                </select>

                <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                  <input type="checkbox" checked={printShowLocation} onChange={(e) => setPrintShowLocation(e.target.checked)} className="rounded" />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Show location info</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={printCompact} onChange={(e) => setPrintCompact(e.target.checked)} className="rounded" />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Compact view</span>
                </label>
              </div>

              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Time range</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={printStart}
                    onChange={(e) => setPrintStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-600"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={printEnd}
                    min={printStart || undefined}
                    onChange={(e) => setPrintEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-600"
                  />
                </div>
                {timezone && <p className="text-blue-600 dark:text-blue-400 font-semibold mt-1.5">{timezone}</p>}
              </div>

              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Time format</p>
                <label className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input type="radio" name="printTimeFormat" checked={printTimeFormat === "12"} onChange={() => setPrintTimeFormat("12")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">12 Hours</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="printTimeFormat" checked={printTimeFormat === "24"} onChange={() => setPrintTimeFormat("24")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">24 Hours</span>
                </label>
              </div>

              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Event types</p>
                {/* Zoho has "Show declined events" (RSVP tracking we don't have) — this toggles
                    our real equivalent, canceled meetings, instead of faking that field. */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={printShowCanceled} onChange={(e) => setPrintShowCanceled(e.target.checked)} className="rounded" />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Show canceled meetings</span>
                </label>
              </div>

              <div>
                <p className="font-bold text-slate-800 dark:text-white mb-2">Print Settings</p>
                <p className="font-semibold text-slate-500 mb-1">Paper layout</p>
                <label className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input type="radio" name="printLayout" checked={printLayout === "landscape"} onChange={() => setPrintLayout("landscape")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Landscape</span>
                </label>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="radio" name="printLayout" checked={printLayout === "portrait"} onChange={() => setPrintLayout("portrait")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Portrait</span>
                </label>

                <p className="font-semibold text-slate-500 mb-1">Font size</p>
                {(["small", "medium", "large"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 mb-1 cursor-pointer capitalize">
                    <input type="radio" name="printFontSize" checked={printFontSize === s} onChange={() => setPrintFontSize(s)} />
                    <span className="font-semibold text-slate-700 dark:text-slate-600 capitalize">{s}</span>
                  </label>
                ))}

                <p className="font-semibold text-slate-500 mb-1 mt-3">Event color and style</p>
                <label className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input type="radio" name="printColorStyle" checked={printColorStyle === "default"} onChange={() => setPrintColorStyle("default")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Default</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="printColorStyle" checked={printColorStyle === "dark"} onChange={() => setPrintColorStyle("dark")} />
                  <span className="font-semibold text-slate-700 dark:text-slate-600">Use dark colours</span>
                </label>
              </div>
            </div>

            {/* Live preview — the only part that actually reaches the printer */}
            <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[var(--muted)] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500">Print Preview</p>
                <button
                  onClick={() => window.print()}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" /> Save as PDF
                </button>
              </div>

              <div
                id="meetingsPrintRoot"
                className={cn(
                  "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                  printCompact ? "p-3" : "p-5",
                  printFontSize === "small" ? "text-xs" : printFontSize === "large" ? "text-base" : "text-sm"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {printDays.length > 0 ? rangeLabel(printDays) : "Pick a date range"}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Nxelio Nurture</span>
                </div>
                {printShowNames && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> {userEmail || "My Calendar"}
                  </div>
                )}
                <div className={cn("border-t border-slate-100 dark:border-slate-800", printCompact ? "pt-2 mb-2" : "pt-3 mb-3")} />

                {printEventCount === 0 ? (
                  <p className="text-slate-400 py-6 text-center">No Events in this range</p>
                ) : (
                  <div className={cn("space-y-4", printCompact && "space-y-2")}>
                    {printGroups.map(({ day, items }) => (
                      <div key={day.toISOString()}>
                        <p className="font-bold text-slate-700 dark:text-slate-600 mb-1.5">
                          {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
                        </p>
                        <div className={cn("space-y-1.5", printCompact && "space-y-1")}>
                          {items.map((m) => {
                            const cat = getEventCategory({ kind: "meeting" as const, title: m.title });
                            const colorClass = getEventStyle(cat).split(" ")[0];
                            return (
                              <div key={m.id} className="flex items-start gap-2">
                                <span className={cn(
                                  "h-2 w-2 rounded-full mt-1 flex-shrink-0",
                                  printColorStyle === "default" ? colorClass : "bg-slate-900 dark:bg-white"
                                )} />
                                <div className="min-w-0">
                                  <p className={cn(
                                    "font-semibold text-slate-800 dark:text-slate-700",
                                    m.status === "canceled" && "line-through text-slate-400 dark:text-slate-500"
                                  )}>
                                    {fmtTimeWithFormat(m.start_at, printTimeFormat)}–{fmtTimeWithFormat(m.end_at, printTimeFormat)} {m.title}
                                    {printShowNames && <span className="text-slate-400 font-normal"> · {cat}</span>}
                                  </p>
                                  {printShowLocation && m.location && (
                                    <p className="text-[11px] text-slate-400">{m.location}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Cancel</Button>
            <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>
      </Modal>
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
          className="p-1 rounded-lg text-slate-500 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm text-white">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); onMonthChange(d); }}
          className="p-1 rounded-lg text-slate-500 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
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
                  ? "bg-blue-600 text-white font-bold shadow-sm"
                  : isToday
                  ? "bg-blue-500/20 text-blue-400 font-bold border border-blue-500/40"
                  : inMonth
                  ? "text-slate-300 hover:bg-white/10"
                  : "text-slate-600"
              )}
            >
              {d.getDate()}
              {inMonth && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-slate-600" />
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

/** Compact single-month grid — no per-card nav arrows — used side-by-side for
 *  the 2 Months / 3 Months views and repeated 12x for the Year view. */
function MiniMonthCard({
  month,
  selectedDay,
  onSelectDay,
  meetingsByDay,
  externalByDay,
}: {
  month: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  meetingsByDay: Map<string, MeetingRow[]>;
  externalByDay: Map<string, SyncedCalendarEvent[]>;
}) {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const days = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
      <p className="text-xs font-bold text-slate-800 dark:text-white mb-2.5 text-center">
        {month.toLocaleDateString([], { month: "long", year: "numeric" })}
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-slate-400 mb-1">
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px]">
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDay);
          const hasEvents = ((meetingsByDay.get(dateKey(d))?.length ?? 0) + (externalByDay.get(dateKey(d))?.length ?? 0)) > 0;
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={cn(
                "h-6 w-6 mx-auto rounded-full flex items-center justify-center font-semibold relative transition-all",
                isSelected
                  ? "bg-indigo-600 text-white font-bold"
                  : isToday
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold"
                  : inMonth
                  ? "text-slate-600 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"
                  : "text-slate-300 dark:text-slate-700"
              )}
            >
              {d.getDate()}
              {hasEvents && inMonth && !isSelected && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
function hourLabel(h: number) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

/** Zoho-style week view — a scrollable hourly time grid with one column per day,
 *  each meeting/event drawn as a block positioned by its actual start time and duration. */
function WeekGrid({
  weekDays,
  meetingsByDay,
  externalByDay,
  selectedDay,
  onSelectDay,
  onOpenMeeting,
  activeCategories,
  getEventCategory,
  getEventStyle,
}: {
  weekDays: Date[];
  meetingsByDay: Map<string, MeetingRow[]>;
  externalByDay: Map<string, SyncedCalendarEvent[]>;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onOpenMeeting: (m: MeetingRow) => void;
  activeCategories: Set<string>;
  getEventCategory: (item: { kind: "meeting" | "external"; title: string }) => string;
  getEventStyle: (cat: string) => string;
}) {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Open scrolled to a couple hours before now, instead of dropping the user at midnight.
    if (scrollRef.current) {
      const startHour = Math.max(0, new Date().getHours() - 2);
      scrollRef.current.scrollTop = startHour * HOUR_HEIGHT;
    }
  }, []);

  const now = new Date();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div
        className="grid border-b border-slate-200 dark:border-slate-800 flex-shrink-0"
        style={{ gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)` }}
      >
        <div />
        {weekDays.map((d) => {
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDay);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={cn(
                "flex flex-col items-center py-2.5 gap-0.5 border-l border-slate-100 dark:border-slate-800 transition-colors",
                isSelected && "bg-slate-50 dark:bg-[var(--muted)]"
              )}
            >
              <span className={cn("text-[10px] font-bold uppercase tracking-wider", isToday ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500")}>
                {d.toLocaleDateString([], { weekday: "short" })}
              </span>
              <span className={cn(
                "h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold",
                isToday ? "bg-indigo-600 text-white" : "text-slate-700 dark:text-slate-600"
              )}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scrollable hourly grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)`, minHeight: 24 * HOUR_HEIGHT }}
        >
          {/* Time column */}
          <div>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="relative text-right pr-2">
                <span className="absolute -top-2 right-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900">
                  {hourLabel(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((d) => {
            const key = dateKey(d);
            const dayMeetings = meetingsByDay.get(key) ?? [];
            const dayExternal = (externalByDay.get(key) ?? []).filter((e) => !e.allDay);
            const events = [
              ...dayMeetings.map((m) => ({ kind: "meeting" as const, id: m.id, start: m.start_at, end: m.end_at, title: m.title, meeting: m })),
              ...dayExternal.map((e) => ({ kind: "external" as const, id: e.id, start: e.start, end: e.end, title: e.title, meeting: null as MeetingRow | null })),
            ].filter((ev) => activeCategories.has(getEventCategory(ev)));

            const isToday = sameDay(d, today);
            const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;

            return (
              <div key={d.toISOString()} className="relative border-l border-slate-100 dark:border-slate-800">
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-100 dark:border-slate-800/60" />
                ))}

                {events.map((ev) => {
                  const s = new Date(ev.start);
                  const e = new Date(ev.end);
                  const startMin = s.getHours() * 60 + s.getMinutes();
                  const durMin = Math.max(20, (e.getTime() - s.getTime()) / 60000);
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = (durMin / 60) * HOUR_HEIGHT;
                  const cat = getEventCategory(ev);
                  const styleClass = getEventStyle(cat);
                  return (
                    <button
                      key={`${ev.kind}-${ev.id}`}
                      onClick={() => ev.meeting && onOpenMeeting(ev.meeting)}
                      style={{ top, height }}
                      className={cn(
                        "absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-left overflow-hidden shadow-xs",
                        styleClass,
                        !ev.meeting && "cursor-default"
                      )}
                    >
                      <span className="block truncate">{fmtTime(ev.start)} {ev.title}</span>
                    </button>
                  );
                })}

                {isToday && (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none flex items-center" style={{ top: nowTop }}>
                    <span className="h-2 w-2 rounded-full bg-rose-500 -ml-1 flex-shrink-0" />
                    <span className="h-px flex-1 bg-rose-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

