"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Mail, Calendar, User, ChevronDown, RefreshCw,
  Download, Filter, Columns, MoreVertical, Plus, Trash2, Edit, CheckSquare, Square,
  X, Bold, Italic, Underline, Link2, List, ListOrdered, Type, Bell
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  activity_type: string; // 'Email' | 'Call' | 'Meeting' | 'User'
  due_date: string;
  created_at: string;
  owner: string;
  lead_id?: string;
  lead_name?: string;
  lead_email?: string;
  description?: string;
  reminder?: number;
  reminder_unit?: string;
  time?: string;
  guests?: string[];
  deal?: string;
  contact?: string;
  company?: string;
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", 
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// Real, DB-backed activity — no fake guests/deal/contact/company attached.
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
    activity_type: isEmail ? "Email" : "User",
    due_date: formattedDate,
    time: d.toTimeString().slice(0, 5),
    created_at: `${formattedDate}, ${formattedTime}`,
    owner: leadName,
    lead_id: a.lead?.id,
    lead_name: leadName,
    lead_email: leadEmail,
    description: a.metadata?.body || "Outreach activities record.",
  };
}

// Real, DB-backed meeting — no fake guests/deal/contact/company attached.
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
    title: m.title || "Scheduled Event",
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
  defaultTab = "emails"
}: {
  dbActivities: DbActivityRow[];
  dbMeetings: MeetingRow[];
  currentUserName: string;
  defaultTab?: "emails" | "meetings" | "users";
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();

  // Tab State: 'emails' | 'meetings' | 'users'
  const [activeTab, setActiveTab] = useState<"emails" | "meetings" | "users">(defaultTab);

  // Real activities/meetings only — seeded once from props. formatDbActivity/formatDbMeeting
  // are plain functions (not hooks), so this lazy initializer depends only on props, which
  // keeps the React Compiler able to verify the later useMemo below.
  const [activities, setActivities] = useState<ActivityItem[]>(() => [
    ...dbActivities.map(formatDbActivity),
    ...dbMeetings.map(formatDbMeeting),
  ]);

  // UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Dropdown states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);

  // Filter criteria: Owner
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>("all");

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    title: true,
    type: true,
    dueDate: true,
    owner: true,
    createdAt: true,
  });

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  // Edit Drawer state
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);

  // Edit panel active tab
  const [drawerTab, setDrawerTab] = useState<"activity" | "comments">("activity");

  // Form states (Dynamic drawer inputs matching mockups)
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

  // New Guest input helper
  const [newGuestInput, setNewGuestInput] = useState("");

  const openEditDrawer = (activity: ActivityItem) => {
    setActiveMenuId(null);
    setEditingActivity(activity);
    setDrawerTab("activity");

    // Populate drawer values
    setFormTitle(activity.title);
    setFormOwner(activity.owner);
    setFormDescription(activity.description || "");
    
    // Map activity_type to tab choices
    const t = activity.activity_type;
    if (t === "Meeting") setFormType("Meeting");
    else setFormType("Email");

    // Map Dates
    try {
      const d = new Date(activity.due_date);
      setFormDate(d.toISOString().slice(0, 10));
    } catch {
      // Fallback if not a standard date format
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

  const handleSaveDrawer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActivity) return;
    if (!formTitle.trim()) {
      toast("Please enter a title.", "error");
      return;
    }

    // Format output dates nicely
    const dObj = new Date(formDate);
    const dateFormatted = dObj.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

    const updated: ActivityItem = {
      ...editingActivity,
      title: formTitle,
      activity_type: formType,
      due_date: dateFormatted,
      time: formTime,
      owner: formOwner,
      description: formDescription,
      reminder: formReminder,
      reminder_unit: formReminderUnit,
      guests: formGuests,
      deal: formDeal,
      contact: formContact,
      company: formCompany
    };

    setActivities(prev => {
      const exists = prev.some(a => a.id === editingActivity.id);
      if (exists) return prev.map(a => (a.id === editingActivity.id ? updated : a));
      return [updated, ...prev];
    });

    setEditingActivity(null);
    toast("Activity details saved successfully!", "success");
  };

  const handleDeleteActivity = async (id: string) => {
    setActiveMenuId(null);
    const ok = await confirm({
      title: "Delete Activity?",
      message: "Are you sure you want to delete this activity record?",
      confirmLabel: "Delete",
      danger: true
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

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleExportCSV = () => {
    setIsExportOpen(false);
    if (filteredAndSorted.length === 0) {
      toast("No activities to export.", "error");
      return;
    }

    const headers = ["Title", "Activity Type", "Due Date", "Owner", "Created At"];
    const rows = filteredAndSorted.map(a => [
      `"${a.title.replace(/"/g, '""')}"`,
      a.activity_type,
      a.due_date,
      a.owner,
      a.created_at
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `activities_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("CSV exported successfully.", "success");
  };

  const uniqueOwners = useMemo(() => {
    const ownersSet = new Set<string>();
    activities.forEach(a => ownersSet.add(a.owner));
    return Array.from(ownersSet);
  }, [activities]);

  // React Compiler can't prove equivalence for this filter+sort combination; the manual useMemo
  // below is correct and functions properly, it just doesn't get auto-memoized on top (verified:
  // multiple equivalent rewrites of the callback body all hit the same compiler limitation).
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const filteredAndSorted = useMemo(() => {
    const result = activities.filter(a => {
      // Tab filter
      if (activeTab === "emails" && a.activity_type !== "Email") return false;
      if (activeTab === "meetings" && a.activity_type !== "Meeting") return false;
      if (activeTab === "users" && a.activity_type !== "User") return false;

      // Owner filter
      if (selectedOwnerFilter !== "all" && a.owner !== selectedOwnerFilter) return false;

      // Search filter
      const q = searchQuery.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.owner.toLowerCase().includes(q) ||
        Boolean(a.lead_email && a.lead_email.toLowerCase().includes(q))
      );
    });

    // Sort — spread into a fresh array rather than mutating `result` in place
    return [...result].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activities, activeTab, selectedOwnerFilter, searchQuery, sortBy]);

  const paginatedActivities = useMemo(() => {
    const startIdx = (currentPage - 1) * entriesPerPage;
    return filteredAndSorted.slice(startIdx, startIdx + entriesPerPage);
  }, [filteredAndSorted, currentPage, entriesPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / entriesPerPage));

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-slate-500 mb-1 text-xs font-semibold">
            <span>Home</span>
            <ChevronDown className="-rotate-90 h-3 w-3 text-slate-400" />
            <span className="text-slate-800 dark:text-slate-200">Activities</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Activities
            </h1>
          </div>
        </div>

        {/* Right side buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-xs"
            >
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </button>
            {isExportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsExportOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-white border border-slate-200 shadow-xl z-40 py-1 text-xs font-semibold text-slate-700">
                  <button onClick={handleExportCSV} className="w-full text-left px-4 py-2 hover:bg-slate-50">CSV File</button>
                  <button onClick={() => { setIsExportOpen(false); toast("Exporting Excel...", "info"); }} className="w-full text-left px-4 py-2 hover:bg-slate-50">Excel Spreadsheet</button>
                  <button onClick={() => { setIsExportOpen(false); toast("Exporting PDF...", "info"); }} className="w-full text-left px-4 py-2 hover:bg-slate-50">PDF Document</button>
                </div>
              </>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => { toast("Refreshed activities list.", "success"); router.refresh(); }}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-xs"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Add New Activity Red Button */}
          <button
            onClick={() => {
              const today = new Date();
              const draft: ActivityItem = {
                id: `new-${Date.now()}`,
                title: "",
                activity_type: activeTab === "emails" ? "Email" : activeTab === "meetings" ? "Meeting" : "User",
                due_date: today.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
                time: "10:00",
                created_at: today.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                owner: currentUserName,
                description: "",
                reminder: 15,
                reminder_unit: "Minutes",
                guests: []
              };
              openEditDrawer(draft);
            }}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add New Activity
          </button>
        </div>
      </div>

      {/* Main card box holding search and activities table */}
      <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {/* Search Input block */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-10 h-10 border-slate-200 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* Toolbar Header Row */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <h2 className="text-base font-bold text-slate-800 capitalize">All {activeTab}</h2>
            <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50">
              <button
                onClick={() => { setActiveTab("emails"); setCurrentPage(1); }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  activeTab === "emails" ? "bg-red-600 text-white shadow-xs" : "text-slate-500 hover:bg-white"
                )}
                title="Emails"
              >
                <Mail className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setActiveTab("meetings"); setCurrentPage(1); }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  activeTab === "meetings" ? "bg-red-600 text-white shadow-xs" : "text-slate-500 hover:bg-white"
                )}
                title="Meetings"
              >
                <Calendar className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setActiveTab("users"); setCurrentPage(1); }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  activeTab === "users" ? "bg-red-600 text-white shadow-xs" : "text-slate-500 hover:bg-white"
                )}
                title="Users Log"
              >
                <User className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Sort By Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-1 text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Sort By <ChevronDown className="h-3 w-3" />
              </button>
              {isSortOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsSortOpen(false)} />
                  <div className="absolute left-0 mt-1.5 w-36 rounded-xl bg-white border border-slate-200 shadow-xl z-40 py-1 text-xs font-semibold text-slate-700">
                    <button onClick={() => { setSortBy("newest"); setIsSortOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">Newest {sortBy === "newest" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}</button>
                    <button onClick={() => { setSortBy("oldest"); setIsSortOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">Oldest {sortBy === "oldest" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}</button>
                    <button onClick={() => { setSortBy("title"); setIsSortOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between">Title {sortBy === "title" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}</button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filter & Column buttons */}
          <div className="flex items-center gap-2">
            {/* Filter */}
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-700 transition-colors",
                  selectedOwnerFilter !== "all" && "border-red-500 bg-red-50/35"
                )}
              >
                <Filter className="h-3.5 w-3.5" /> Filter <ChevronDown className="h-3 w-3" />
              </button>
              {isFilterOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsFilterOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white border border-slate-200 shadow-xl z-40 py-1.5 text-xs font-semibold text-slate-700">
                    <p className="px-3.5 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Filter By Owner</p>
                    <button onClick={() => { setSelectedOwnerFilter("all"); setIsFilterOpen(false); setCurrentPage(1); }} className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between">Show All {selectedOwnerFilter === "all" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}</button>
                    {uniqueOwners.map(owner => (
                      <button key={owner} onClick={() => { setSelectedOwnerFilter(owner); setIsFilterOpen(false); setCurrentPage(1); }} className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between truncate">{owner} {selectedOwnerFilter === owner && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}</button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Manage Columns */}
            <div className="relative">
              <button
                onClick={() => setIsColumnsOpen(!isColumnsOpen)}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 border border-slate-200 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs"
              >
                <Columns className="h-3.5 w-3.5" /> Manage Columns
              </button>
              {isColumnsOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsColumnsOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white border border-slate-200 shadow-xl z-40 p-3 text-xs font-semibold text-slate-700 space-y-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pb-1.5 border-b border-slate-100">Show/Hide Columns</p>
                    {[
                      { key: "title", label: "Title" },
                      { key: "type", label: "Activity Type" },
                      { key: "dueDate", label: "Date & Time" },
                      { key: "owner", label: "Owner" },
                      { key: "createdAt", label: "Created At" },
                    ].map(col => (
                      <button
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        className="w-full flex items-center gap-2 py-1 text-slate-600 hover:text-slate-900"
                      >
                        {visibleColumns[col.key] ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-slate-300" />}
                        <span>{col.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Activities Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3.5 w-10 text-center">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.length === filteredAndSorted.length && filteredAndSorted.length > 0 ? (
                      <CheckSquare className="h-4.5 w-4.5 text-blue-600" />
                    ) : (
                      <Square className="h-4.5 w-4.5" />
                    )}
                  </button>
                </th>
                {visibleColumns.title && <th className="px-4 py-3.5 font-bold">Title</th>}
                {visibleColumns.type && <th className="px-4 py-3.5 font-bold">Activity Type</th>}
                {visibleColumns.dueDate && <th className="px-4 py-3.5 font-bold">Date & Time</th>}
                {visibleColumns.owner && <th className="px-4 py-3.5 font-bold">Owner</th>}
                {visibleColumns.createdAt && <th className="px-4 py-3.5 font-bold">Created At</th>}
                <th className="px-4 py-3.5 w-16 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedActivities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400 italic">
                    No matching activities found.
                  </td>
                </tr>
              ) : (
                paginatedActivities.map((a) => {
                  const isSelected = selectedIds.includes(a.id);
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "hover:bg-slate-50/50 transition-colors text-xs text-slate-700",
                        isSelected && "bg-blue-50/20"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={() => handleSelectOne(a.id)} className="text-slate-400">
                          {isSelected ? (
                            <CheckSquare className="h-4.5 w-4.5 text-blue-600" />
                          ) : (
                            <Square className="h-4.5 w-4.5" />
                          )}
                        </button>
                      </td>

                      {/* Title */}
                      {visibleColumns.title && (
                        <td className="px-4 py-3.5 font-semibold text-slate-900 hover:underline max-w-[280px] truncate">
                          <button
                            onClick={() => openEditDrawer(a)}
                            className="text-left font-bold text-slate-900 hover:text-red-600 transition-colors"
                          >
                            {a.title}
                          </button>
                        </td>
                      )}

                      {/* Activity Type */}
                      {visibleColumns.type && (
                        <td className="px-4 py-3.5">
                          <Badge variant="warning" className="bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/20 px-2 py-0.5 rounded font-bold text-[10px]">
                            {a.activity_type}
                          </Badge>
                        </td>
                      )}

                      {/* Date & Time */}
                      {visibleColumns.dueDate && (
                        <td className="px-4 py-3.5 font-medium text-slate-600">
                          {a.due_date} {a.time && `· ${a.time}`}
                        </td>
                      )}

                      {/* Owner */}
                      {visibleColumns.owner && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shadow-xs", avatarColor(a.owner))}>
                              {initials(a.owner)}
                            </span>
                            <span className="font-semibold text-slate-800">{a.owner}</span>
                          </div>
                        </td>
                      )}

                      {/* Created At */}
                      {visibleColumns.createdAt && (
                        <td className="px-4 py-3.5 font-medium text-slate-500">
                          {a.created_at}
                        </td>
                      )}

                      {/* Action Dropdown Menu */}
                      <td className="px-4 py-3.5 text-center relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === a.id ? null : a.id)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {activeMenuId === a.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setActiveMenuId(null)} />
                            <div className="absolute right-4 top-10 w-24 bg-white border border-slate-200 rounded-xl shadow-xl z-45 py-1 text-left text-xs font-semibold text-slate-700">
                              <button
                                onClick={() => openEditDrawer(a)}
                                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-1.5"
                              >
                                <Edit className="h-3 w-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleDeleteActivity(a.id)}
                                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-rose-600 flex items-center gap-1.5"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={entriesPerPage}
              onChange={(e) => { setEntriesPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {[10, 25, 50].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600"
            >
              <ChevronDown className="rotate-90 h-3 w-3" />
            </button>
            <span className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white font-bold shadow-xs">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600"
            >
              <ChevronDown className="-rotate-90 h-3 w-3" />
            </button>
          </div>
        </div>
      </Card>

      {/* RICH CRM SLIDE-OUT EDIT DRAWER */}
      {editingActivity && (
        <>
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50 transition-opacity duration-300" 
            onClick={() => setEditingActivity(null)} 
          />

          {/* Drawer Body Container */}
          <aside className="fixed right-0 top-0 bottom-0 z-[60] w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out translate-x-0 overflow-hidden">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div className="min-w-0 pr-8">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight leading-snug truncate">
                  {formTitle || "Activity details"}
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Commented by <span className="text-slate-600">{formOwner || currentUserName}</span> on {editingActivity.created_at}
                </p>
              </div>
              <button 
                onClick={() => setEditingActivity(null)}
                className="h-7 w-7 rounded-full border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation Tabs inside Drawer */}
            <div className="px-6 border-b border-slate-100 flex gap-5 text-sm font-semibold">
              <button 
                onClick={() => setDrawerTab("activity")}
                className={cn(
                  "pb-3.5 relative",
                  drawerTab === "activity" ? "text-red-600" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Activity
                {drawerTab === "activity" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />}
              </button>
              <button 
                onClick={() => setDrawerTab("comments")}
                className={cn(
                  "pb-3.5 relative flex items-center gap-1",
                  drawerTab === "comments" ? "text-red-600" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Comments <span className="bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full text-[10px]">0</span>
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveDrawer} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
              
              {/* Form - Tab Content: Activity */}
              {drawerTab === "activity" && (
                <div className="space-y-5">
                  {/* Title Field */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Title <span className="text-red-500">*</span></label>
                    <Input 
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="Enter activity title"
                      required
                      className="rounded-xl border-slate-200 h-10 text-sm font-medium"
                    />
                  </div>

                  {/* Activity Type Selection */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Activity Type <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { key: "Email", label: "Email", icon: Mail },
                        { key: "Meeting", label: "Meeting", icon: Calendar },
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = formType === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setFormType(item.key as "Email" | "Meeting")}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-all shadow-2xs",
                              active 
                                ? "border-red-500 text-red-600 bg-red-50/20" 
                                : "border-slate-200 text-slate-500 hover:bg-slate-50"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Due Date & Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Due Date <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="date"
                          value={formDate}
                          onChange={e => setFormDate(e.target.value)}
                          required
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={formTime}
                          onChange={e => setFormTime(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reminder */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Reminder <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-3 gap-3 items-center">
                      <div className="relative col-span-1">
                        <Bell className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="number"
                          value={formReminder}
                          onChange={e => setFormReminder(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                      </div>
                      <select
                        value={formReminderUnit}
                        onChange={e => setFormReminderUnit(e.target.value)}
                        className="col-span-1 rounded-xl border border-slate-200 px-3.5 py-2.5 font-medium bg-white text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
                      >
                        <option value="Minutes">Minutes</option>
                        <option value="Hours">Hours</option>
                        <option value="Days">Days</option>
                      </select>
                      <span className="col-span-1 font-bold text-slate-500 pl-1">Before Due</span>
                    </div>
                  </div>

                  {/* Owner & Guests */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Owner <span className="text-red-500">*</span></label>
                      <select
                        value={formOwner}
                        onChange={e => setFormOwner(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-semibold bg-white text-xs focus:outline-none"
                      >
                        <option value={currentUserName}>{currentUserName}</option>
                        {uniqueOwners.filter(o => o !== currentUserName).map(owner => (
                          <option key={owner} value={owner}>{owner}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Guests <span className="text-red-500">*</span></label>
                      <div className="space-y-2">
                        {/* Guest tags list */}
                        <div className="flex flex-wrap gap-1.5">
                          {formGuests.map(name => (
                            <Badge key={name} variant="blue" className="bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center gap-1 text-[10px] py-0.5 px-2">
                              <span className="h-3.5 w-3.5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[8px] font-bold">
                                {initials(name)}
                              </span>
                              {name}
                              <button type="button" onClick={() => removeGuest(name)} className="hover:text-red-500 ml-0.5">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        {/* Add Guest input */}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add guest name"
                            value={newGuestInput}
                            onChange={e => setNewGuestInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addGuest())}
                            className="rounded-xl border-slate-200 h-8 text-[11px] font-medium"
                          />
                          <button
                            type="button"
                            onClick={addGuest}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded-lg"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description Box with mockup Rich-text toolbar */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Description <span className="text-red-500">*</span></label>
                    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      {/* Editor Toolbar */}
                      <div className="bg-slate-50 border-b border-slate-200 p-2 flex items-center flex-wrap gap-2 text-slate-500">
                        <select className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 outline-none h-6">
                          <option>Normal</option>
                          <option>Heading 1</option>
                          <option>Heading 2</option>
                        </select>
                        <div className="h-4 w-px bg-slate-200 mx-0.5" />
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><Bold className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><Italic className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><Underline className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><Link2 className="h-3.5 w-3.5" /></button>
                        <div className="h-4 w-px bg-slate-200 mx-0.5" />
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><List className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><ListOrdered className="h-3.5 w-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-slate-100 hover:text-slate-800 rounded transition-colors"><Type className="h-3.5 w-3.5" /></button>
                      </div>
                      <textarea
                        value={formDescription}
                        onChange={e => setFormDescription(e.target.value)}
                        placeholder="Write activity logs details..."
                        className="w-full min-h-[100px] p-3 text-xs focus:outline-none resize-y font-medium text-slate-700 leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Deals, Contacts, Companies selects */}
                  <div className="space-y-4 pt-2">
                    {/* Deals select */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <span className="font-bold text-slate-500">Deals</span>
                      </div>
                      <div className="w-2/3 flex items-center gap-2">
                        <Input
                          value={formDeal}
                          onChange={e => setFormDeal(e.target.value)}
                          placeholder="No deal linked — not wired up yet"
                          className="flex-1 rounded-xl border-slate-200 h-9 text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* Contacts select — real names pulled from this workspace's activities */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <span className="font-bold text-slate-500">Contacts</span>
                      </div>
                      <div className="w-2/3 flex items-center gap-2">
                        <select
                          value={formContact}
                          onChange={e => setFormContact(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 bg-white font-medium"
                        >
                          <option value="">— No contact —</option>
                          {uniqueOwners.map(owner => (
                            <option key={owner} value={owner}>{owner}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form - Tab Content: Comments */}
              {drawerTab === "comments" && (
                <div className="py-12 text-center text-slate-400 italic">
                  No comments logged for this activity log.
                </div>
              )}

              {/* Drawer Footer Actions */}
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 bg-white sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => setEditingActivity(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </div>
  );
}
