"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronRight, Download, RefreshCw, Layout, Plus,
  MoreVertical, Edit, Trash2, Phone, Mail, Calendar, User,
  ChevronDown, Filter, Columns, X, CheckSquare, Square,
  Bold, Italic, Underline, Link2, List, ListOrdered, Type, UserPlus
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { MeetingRow } from "@/lib/queries/meetings";

export interface DbActivityRow {
  id: string;
  activity_type: string;
  created_at: string;
  metadata: Record<string, string> | null;
  lead: { id: string; full_name: string | null; company_name: string | null; email: string | null } | null;
}

interface ActivityItem {
  id: string;
  title: string;
  activity_type: "Meeting" | "Calls" | "Email" | "Task" | "User";
  due_date: string;
  time: string;
  created_at: string;
  owner: string;
  lead_id?: string;
  lead_name?: string;
  lead_email?: string;
  description?: string;
  reminder?: number;
  reminder_unit?: string;
  guests?: string[];
  deal?: string;
  contact?: string;
  company?: string;
}

const AVATAR_COLORS = [
  "bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600",
  "bg-violet-650", "bg-cyan-600", "bg-pink-600", "bg-indigo-600"
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatDbActivity(a: DbActivityRow): ActivityItem {
  const leadName = a.lead?.full_name || a.lead?.company_name || "Unknown Lead";
  const leadEmail = a.lead?.email || "";
  const d = new Date(a.created_at);

  const formattedDate = d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  const formattedTime = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const isEmail = a.activity_type.startsWith("EMAIL_");

  return {
    id: a.id,
    title: a.metadata?.subject || a.metadata?.campaign_name || `${a.activity_type.replace(/_/g, " ")} for lead`,
    activity_type: isEmail ? "Email" : "Task",
    due_date: formattedDate,
    time: d.toTimeString().slice(0, 5),
    created_at: `${formattedDate}, ${formattedTime}`,
    owner: leadName,
    lead_id: a.lead?.id,
    lead_name: leadName,
    lead_email: leadEmail,
    description: a.metadata?.body || "Outreach activity logged.",
  };
}

function formatDbMeeting(m: MeetingRow): ActivityItem {
  const leadName = m.lead?.full_name || m.lead?.company_name || "Unknown Contact";
  const leadEmail = m.lead?.email || "";
  const d = new Date(m.start_at);

  const formattedStart = d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  const formattedCreated = new Date(m.created_at || m.start_at).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    id: m.id,
    title: m.title || "Scheduled Meeting",
    activity_type: "Meeting",
    due_date: formattedStart,
    time: d.toTimeString().slice(0, 5),
    created_at: formattedCreated,
    owner: leadName,
    lead_id: m.lead?.id,
    lead_name: leadName,
    lead_email: leadEmail,
    description: m.description || "Meetings & Calls activity log.",
  };
}

export function ActivitiesDashboardView({
  dbActivities,
  dbMeetings,
  currentUserName,
}: {
  dbActivities: DbActivityRow[];
  dbMeetings: MeetingRow[];
  currentUserName: string;
  defaultTab?: string;
}) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();

  // Real activities/meetings only — seeded once from props via a lazy
  // initializer (no mock rows).
  const [activities, setActivities] = useState<ActivityItem[]>(() => [
    ...dbActivities.map(formatDbActivity),
    ...dbMeetings.map(formatDbMeeting),
  ]);

  // Stable per-session id source — avoids calling the impure Date.now()
  // directly inside render/handlers (React Compiler purity rule).
  const [sessionId] = useState(() => Date.now());

  // UI state
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]); // empty = all

  // Dropdown states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState("all");

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    title: true,
    type: true,
    dueDate: true,
    owner: true,
    createdAt: true,
  });

  // Add/Edit Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<"activity" | "comments">("activity");

  // Form Fields State
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<"Email" | "Meeting">("Email");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formReminder, setFormReminder] = useState<number>(15);
  const [formReminderUnit, setFormReminderUnit] = useState("Minutes");
  const [formOwner, setFormOwner] = useState("");
  const [formGuests, setFormGuests] = useState<string[]>([]);
  const [formDescription, setFormDescription] = useState("");
  const [formDeal, setFormDeal] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [newGuestInput, setNewGuestInput] = useState("");

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleRefresh = () => {
    toast("Refreshing activities...", "info");
    router.refresh();
    setTimeout(() => window.location.reload(), 100);
  };

  const handleExportCsv = () => {
    setIsExportOpen(false);
    const headers = "ID,Title,Type,DueDate,Owner,CreatedAt\n";
    const rows = filteredAndSorted.map(
      (a) => `"${a.id}","${a.title}","${a.activity_type}","${a.due_date}","${a.owner}","${a.created_at}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activities_export_${sessionId}.csv`;
    link.click();
    toast("Activities exported successfully.", "success");
  };

  // Open Edit Drawer
  const openEditDrawer = (activity: ActivityItem) => {
    setActiveMenuId(null);
    setEditingActivity(activity);
    setIsDrawerOpen(true);
    setDrawerTab("activity");

    setFormTitle(activity.title);
    setFormOwner(activity.owner);
    setFormDescription(activity.description || "");
    setFormType(activity.activity_type === "Meeting" ? "Meeting" : "Email");

    try {
      const d = new Date(activity.due_date);
      setFormDate(d.toISOString().slice(0, 10));
    } catch {
      setFormDate(new Date().toISOString().slice(0, 10));
    }

    setFormTime(activity.time || "10:00");
    setFormReminder(activity.reminder ?? 15);
    setFormReminderUnit(activity.reminder_unit || "Minutes");
    setFormGuests(activity.guests || []);
    setFormDeal(activity.deal || "");
    setFormContact(activity.contact || "");
    setFormCompany(activity.company || "");
  };

  // Save Drawer Form
  const handleSaveDrawer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast("Please enter a title.", "error");
      return;
    }

    const formattedDate = new Date(formDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

    if (editingActivity) {
      // Update
      const updated: ActivityItem = {
        ...editingActivity,
        title: formTitle,
        activity_type: formType,
        due_date: formattedDate,
        time: formTime,
        owner: formOwner,
        description: formDescription,
        reminder: formReminder,
        reminder_unit: formReminderUnit,
        guests: formGuests,
        deal: formDeal,
        contact: formContact,
        company: formCompany,
      };

      setActivities(prev => prev.map(a => (a.id === editingActivity.id ? updated : a)));
      toast("Activity details saved successfully!", "success");
    } else {
      // Create
      const created: ActivityItem = {
        id: `act-${Date.now()}`,
        title: formTitle,
        activity_type: formType,
        due_date: formattedDate,
        time: formTime,
        created_at: new Date().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        owner: formOwner || currentUserName,
        description: formDescription,
        reminder: formReminder,
        reminder_unit: formReminderUnit,
        guests: formGuests,
        deal: formDeal,
        contact: formContact,
        company: formCompany,
      };

      setActivities(prev => [created, ...prev]);
      toast("New Activity created successfully!", "success");
    }

    setIsDrawerOpen(false);
    setEditingActivity(null);
  };

  // Delete activity
  const handleDeleteActivity = async (id: string) => {
    setActiveMenuId(null);
    const ok = await confirm({
      title: "Delete Activity?",
      message: "Are you sure you want to delete this activity record?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    setActivities(prev => prev.filter(a => a.id !== id));
    toast("Activity deleted successfully.", "success");
  };

  const addGuest = () => {
    if (newGuestInput.trim() && !formGuests.includes(newGuestInput.trim())) {
      setFormGuests(prev => [...prev, newGuestInput.trim()]);
      setNewGuestInput("");
    }
  };

  const removeGuest = (name: string) => {
    setFormGuests(prev => prev.filter(x => x !== name));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredAndSorted.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSorted.map(a => a.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Filter & Sort logic. React Compiler can't prove equivalence for this filter+sort
  // combination; the manual useMemo below is correct and works fine, it just doesn't get
  // auto-memoized on top (same known limitation hit and documented earlier in this file's
  // history for an equivalent filter+sort hook).
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const filteredAndSorted = useMemo(() => {
    const filtered = activities.filter((a) => {
      const matchesSearch =
        !search ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.owner.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        selectedTypes.length === 0 || selectedTypes.includes(a.activity_type);

      const matchesOwner =
        selectedOwnerFilter === "all" ||
        (selectedOwnerFilter === "me" && a.owner === currentUserName) ||
        (selectedOwnerFilter === "others" && a.owner !== currentUserName);

      return matchesSearch && matchesType && matchesOwner;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortBy === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [activities, search, selectedTypes, selectedOwnerFilter, sortBy, currentUserName]);

  // Real owner names — always includes the current user so the "Owner" select
  // has a valid option even in a brand-new workspace with no activity history yet.
  const ownersList = useMemo(() => {
    return Array.from(new Set([currentUserName, ...activities.map(a => a.owner)]));
  }, [activities, currentUserName]);

  // Real lead/contact names from actual activities and meetings — no fake people.
  const contactsList = useMemo(() => {
    const names = activities.map(a => a.lead_name).filter((n): n is string => Boolean(n));
    return Array.from(new Set(names));
  }, [activities]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              Activities 
              <Badge className="bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold py-0.5 px-2">
                {activities.length}
              </Badge>
            </h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>Home</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-650 font-medium">Activities</span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(prev => !prev)}
              className="rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800"
            >
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </Button>
            {isExportOpen && (
              <div className="absolute right-0 mt-1 z-35 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1">
                <button
                  onClick={handleExportCsv}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="rounded-xl border border-slate-200 dark:border-slate-800 h-9 w-9 p-0 flex items-center justify-center text-slate-500"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border border-slate-200 dark:border-slate-800 h-9 w-9 p-0 flex items-center justify-center text-slate-500"
          >
            <Layout className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* FILTER CONTROLS & TABLE CARD */}
      <Card className="overflow-visible">
        {/* Search bar & Add Activity button */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="w-full sm:w-80">
            <Input
              leftIcon={<Search className="h-4 w-4 text-slate-400" />}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 text-sm rounded-xl"
            />
          </div>

          <Button
            onClick={() => {
              setEditingActivity(null);
              setFormTitle("");
              setFormOwner(currentUserName);
              setFormDescription("");
              setFormType("Email");
              setFormDate(new Date().toISOString().slice(0, 10));
              setFormTime("10:00");
              setFormReminder(15);
              setFormReminderUnit("Minutes");
              setFormGuests([]);
              setFormDeal("");
              setFormContact("");
              setFormCompany("");
              setIsDrawerOpen(true);
            }}
            className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add New Activity
          </Button>
        </div>

        {/* Toolbar: Filters, Types, Columns */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-slate-900 dark:text-white mr-1">All Activities</span>

            {/* Quick type filter icons */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900 shadow-xs">
              {([
                { type: "Calls", icon: Phone, color: "text-emerald-600" },
                { type: "Email", icon: Mail, color: "text-amber-500" },
                { type: "Meeting", icon: Calendar, color: "text-blue-600" },
                { type: "Task", icon: User, color: "text-red-500" },
              ] as const).map((item) => {
                const Icon = item.icon;
                const active = selectedTypes.includes(item.type);
                return (
                  <button
                    key={item.type}
                    onClick={() => toggleTypeFilter(item.type)}
                    className={cn(
                      "p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                      active ? "bg-slate-100 dark:bg-slate-800 shadow-inner" : ""
                    )}
                    title={`Toggle ${item.type}`}
                  >
                    <Icon className={cn("h-4 w-4", item.color)} />
                  </button>
                );
              })}
            </div>

            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "title")}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-650 dark:text-slate-500 outline-none cursor-pointer h-9"
            >
              <option value="newest">Sort: Newest first</option>
              <option value="oldest">Sort: Oldest first</option>
              <option value="title">Sort: Title A-Z</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Owner Filter Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFilterOpen(prev => !prev)}
                className="rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" /> Filter <ChevronDown className="h-3 w-3" />
              </Button>
              {isFilterOpen && (
                <div className="absolute right-0 mt-1 z-35 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-3 space-y-3">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Filter by Owner</p>
                  <div className="space-y-2">
                    {([
                      { value: "all", label: "All Owners" },
                      { value: "me", label: "Me" },
                      { value: "others", label: "Others" },
                    ] as const).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer">
                        <input
                          type="radio"
                          name="ownerFilter"
                          checked={selectedOwnerFilter === opt.value}
                          onChange={() => {
                            setSelectedOwnerFilter(opt.value);
                            setIsFilterOpen(false);
                          }}
                          className="text-indigo-650"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column Selector */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsColumnsOpen(prev => !prev)}
                className="rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 gap-1.5"
              >
                <Columns className="h-3.5 w-3.5" /> Manage Columns <ChevronDown className="h-3 w-3" />
              </Button>
              {isColumnsOpen && (
                <div className="absolute right-0 mt-1 z-35 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-2 space-y-1">
                  <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Show Columns</p>
                  {([
                    { col: "title", label: "Title" },
                    { col: "type", label: "Activity Type" },
                    { col: "dueDate", label: "Due Date" },
                    { col: "owner", label: "Owner" },
                    { col: "createdAt", label: "Created At" },
                  ] as const).map((c) => (
                    <label key={c.col} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns[c.col]}
                        onChange={() => setVisibleColumns(prev => ({ ...prev, [c.col]: !prev[c.col] }))}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* THE TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-850 text-slate-400 dark:text-slate-500 text-xs font-bold uppercase bg-slate-50/40 dark:bg-slate-950/20">
                <th className="py-3 px-4 w-10">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.length === filteredAndSorted.length && filteredAndSorted.length > 0 ? (
                      <CheckSquare className="h-4.5 w-4.5 text-indigo-650" />
                    ) : (
                      <Square className="h-4.5 w-4.5" />
                    )}
                  </button>
                </th>
                {visibleColumns.title && <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500">Title</th>}
                {visibleColumns.type && <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500">Activity Type</th>}
                {visibleColumns.dueDate && <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500">Due Date</th>}
                {visibleColumns.owner && <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500">Owner</th>}
                {visibleColumns.createdAt && <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500">Created At</th>}
                <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-500 text-right w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850/80">
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-slate-450 text-xs font-semibold">
                    No activity logs found. Click <strong className="text-slate-700 dark:text-slate-350">Add New Activity</strong> to schedule one.
                  </td>
                </tr>
              )}
              {filteredAndSorted.map((item) => {
                const initials = getInitials(item.owner);
                const avatarCol = getAvatarColor(item.owner);
                const selected = selectedIds.includes(item.id);

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors text-sm",
                      selected ? "bg-slate-50/20 dark:bg-[var(--muted)]" : ""
                    )}
                  >
                    <td className="py-3.5 px-4">
                      <button onClick={() => toggleSelectOne(item.id)} className="text-slate-400 hover:text-slate-600">
                        {selected ? (
                          <CheckSquare className="h-4.5 w-4.5 text-indigo-650" />
                        ) : (
                          <Square className="h-4.5 w-4.5" />
                        )}
                      </button>
                    </td>

                    {/* Title */}
                    {visibleColumns.title && (
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => openEditDrawer(item)}
                          className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 transition-colors text-left"
                        >
                          {item.title}
                        </button>
                      </td>
                    )}

                    {/* Activity Type Badge */}
                    {visibleColumns.type && (
                      <td className="py-3.5 px-4">
                        {item.activity_type === "Meeting" && (
                          <Badge variant="blue" className="rounded-lg font-bold text-xs gap-1 py-0.5 px-2">
                            <Calendar className="h-3 w-3" /> Meeting
                          </Badge>
                        )}
                        {item.activity_type === "Calls" && (
                          <Badge variant="success" className="rounded-lg font-bold text-xs gap-1 py-0.5 px-2">
                            <Phone className="h-3 w-3" /> Calls
                          </Badge>
                        )}
                        {item.activity_type === "Email" && (
                          <Badge variant="warning" className="rounded-lg font-bold text-xs gap-1 py-0.5 px-2 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-250">
                            <Mail className="h-3 w-3" /> Email
                          </Badge>
                        )}
                        {item.activity_type === "Task" && (
                          <Badge variant="danger" className="rounded-lg font-bold text-xs gap-1 py-0.5 px-2">
                            <User className="h-3 w-3" /> Task
                          </Badge>
                        )}
                      </td>
                    )}

                    {/* Due Date */}
                    {visibleColumns.dueDate && (
                      <td className="py-3.5 px-4 font-semibold text-slate-600 dark:text-slate-350">
                        {item.due_date} {item.time && `, ${item.time}`}
                      </td>
                    )}

                    {/* Owner avatar & initials */}
                    {visibleColumns.owner && (
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", avatarCol)}>
                            {initials}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-[130px]">{item.owner}</span>
                        </div>
                      </td>
                    )}

                    {/* Created At */}
                    {visibleColumns.createdAt && (
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-500 dark:text-slate-500">
                        {item.created_at}
                      </td>
                    )}

                    {/* Action button dot selector */}
                    <td className="py-3.5 px-4 text-right relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                      >
                        <MoreVertical className="h-4.5 w-4.5" />
                      </button>
                      {activeMenuId === item.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setActiveMenuId(null)} />
                          <div className="absolute right-4 mt-1 z-30 w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1 text-left">
                            <button
                              onClick={() => openEditDrawer(item)}
                              className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
                            >
                              <Edit className="h-3.5 w-3.5 text-slate-500" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(item.id)}
                              className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-955/40 text-rose-600 flex items-center gap-1.5"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* COMPREHENSIVE EDIT/ADD SLIDING SIDE DRAWER */}
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          
          {/* Drawer container */}
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[500px] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-850 flex flex-col h-screen animate-in slide-in-from-right duration-250">
            
            {/* Header info */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[380px]">
                    {editingActivity ? `Edit: ${formTitle || "Activity"}` : "Create New Activity"}
                  </h3>
                  <p className="text-[10px] text-slate-450 mt-1 uppercase tracking-wider font-bold">
                    {editingActivity ? `Owner: ${formOwner || "Unknown"}` : `Creator: ${currentUserName}`}
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tab selector menu */}
              <div className="flex items-center gap-4 mt-5 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setDrawerTab("activity")}
                  className={cn(
                    "pb-2 text-xs font-bold uppercase tracking-wider transition-all",
                    drawerTab === "activity"
                      ? "border-b-2 border-red-500 text-red-650 dark:text-red-400"
                      : "text-slate-450 hover:text-slate-700"
                  )}
                >
                  Activity
                </button>
                <button
                  onClick={() => setDrawerTab("comments")}
                  className={cn(
                    "pb-2 text-xs font-bold uppercase tracking-wider transition-all",
                    drawerTab === "comments"
                      ? "border-b-2 border-red-500 text-red-650 dark:text-red-400"
                      : "text-slate-450 hover:text-slate-700"
                  )}
                >
                  Comments (0)
                </button>
              </div>
            </div>

            {/* Scrollable form */}
            <form onSubmit={handleSaveDrawer} className="flex-1 overflow-y-auto p-5 space-y-4">
              {drawerTab === "activity" ? (
                <div className="space-y-4">
                  {/* Title field */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-450 uppercase mb-1.5">Title</label>
                    <Input
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Discuss onboarding process"
                      className="rounded-xl text-sm"
                    />
                  </div>

                  {/* Activity Type Selection Tabs */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Activity Type</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setFormType("Email")}
                        className={cn(
                          "py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                          formType === "Email"
                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Mail className="h-3.5 w-3.5" /> Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormType("Meeting")}
                        className={cn(
                          "py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                          formType === "Meeting"
                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Calendar className="h-3.5 w-3.5" /> Meeting
                      </button>
                    </div>
                  </div>

                  {/* Due Date & Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-655 dark:text-slate-455 uppercase mb-1.5">Due Date</label>
                      <Input
                        required
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-655 dark:text-slate-455 uppercase mb-1.5">Time</label>
                      <Input
                        required
                        type="time"
                        value={formTime}
                        onChange={(e) => setFormTime(e.target.value)}
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  {/* Reminder */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Reminder</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={formReminder}
                        onChange={(e) => setFormReminder(Number(e.target.value))}
                        className="w-20 rounded-xl text-sm"
                      />
                      <select
                        value={formReminderUnit}
                        onChange={(e) => setFormReminderUnit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350 outline-none focus:ring-1 focus:ring-indigo-500 h-10"
                      >
                        <option value="Minutes">Minutes</option>
                        <option value="Hours">Hours</option>
                        <option value="Days">Days</option>
                      </select>
                      <span className="text-xs font-semibold text-slate-500">before due</span>
                    </div>
                  </div>

                  {/* Owner & Guests list */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Owner</label>
                      <Select
                        value={formOwner}
                        onChange={(e) => setFormOwner(e.target.value)}
                        className="rounded-xl text-xs"
                      >
                        {ownersList.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Add Guests</label>
                      <div className="flex gap-2">
                        <Input
                          value={newGuestInput}
                          onChange={(e) => setNewGuestInput(e.target.value)}
                          placeholder="Name or Email"
                          className="rounded-xl text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addGuest();
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={addGuest} className="rounded-xl flex-shrink-0 h-10 px-3">
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Guests list container */}
                  {formGuests.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Guest List</p>
                      <div className="flex flex-wrap gap-1.5">
                        {formGuests.map((g) => (
                          <span key={g} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-350 border border-slate-200/50 dark:border-slate-800">
                            {g}
                            <button type="button" onClick={() => removeGuest(g)} className="text-slate-400 hover:text-red-500">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text Editor Toolbar & Description textarea */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Description</label>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col bg-white dark:bg-slate-900">
                      {/* Rich toolbar mock styling */}
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-800 text-slate-400">
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850"><Type className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850 font-bold"><Bold className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850 italic"><Italic className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850 underline"><Underline className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850"><Link2 className="h-3.5 w-3.5" /></button>
                        <span className="w-px h-4 bg-slate-200 dark:bg-slate-850 mx-1" />
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850"><List className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850"><ListOrdered className="h-3.5 w-3.5" /></button>
                      </div>
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Agenda, goals, or meeting context..."
                        className="w-full p-3 min-h-[120px] text-sm text-slate-850 dark:text-slate-800 bg-white dark:bg-slate-900 border-none outline-none resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Deals & Contacts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Deal — free text, no real deals data source is wired into this view yet */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Deal</label>
                      <Input
                        value={formDeal}
                        onChange={(e) => setFormDeal(e.target.value)}
                        placeholder="No deal linked"
                        className="rounded-xl text-xs"
                      />
                    </div>

                    {/* Contact — real names pulled from this workspace's activities/meetings */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-650 dark:text-slate-455 uppercase mb-1.5">Contact</label>
                      <Select value={formContact} onChange={(e) => setFormContact(e.target.value)} className="rounded-xl text-xs">
                        <option value="">No linked contact</option>
                        {contactsList.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center text-slate-400 text-xs font-semibold">
                  No comments logged for this activity.
                </div>
              )}
            </form>

            {/* Footer buttons */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-xl px-4 py-2 font-semibold text-sm border-slate-200 dark:border-slate-800 h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDrawer}
                className="rounded-xl px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-sm"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
