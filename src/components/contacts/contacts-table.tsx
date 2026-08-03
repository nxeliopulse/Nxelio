"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Trash2, ChevronDown, Users2, Mail, ArrowUpDown, Settings2,
  Phone, MessageSquare, Eye, MoreVertical, Star, Calendar, Filter, Grid, List,
  TrendingUp, Pencil, RefreshCw, User, Link2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { deleteContact, bulkDeleteContacts, type ContactRow } from "@/lib/queries/contacts";

type ColKey = "phone" | "tags" | "location" | "rating" | "contact" | "status";

interface ColumnDef { key: ColKey; label: string; defaultOn: boolean }

const COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Phone", defaultOn: true },
  { key: "tags", label: "Tags", defaultOn: true },
  { key: "location", label: "Location", defaultOn: true },
  { key: "rating", label: "Rating", defaultOn: true },
  { key: "contact", label: "Contact", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_contacts_columns_redesign";
const PAGE_SIZE = 15;

// Simple string hash to generate consistent derived mock data
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getFlagEmoji(country: string): string {
  const c = country.toUpperCase();
  if (c.includes("USA") || c.includes("UNITED STATES")) return "🇺🇸";
  if (c.includes("UAE") || c.includes("EMIRATES")) return "🇦🇪";
  if (c.includes("GERMANY")) return "🇩🇪";
  if (c.includes("FRANCE")) return "🇫🇷";
  if (c.includes("INDIA")) return "🇮🇳";
  if (c.includes("BRAZIL")) return "🇧🇷";
  if (c.includes("MEXICO")) return "🇲🇽";
  return "🇺🇸"; // default fallback for template matches
}

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountFilterId = searchParams.get("account");
  const [pending, start] = useTransition();

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"none" | "name_az" | "name_za" | "newest">("none");
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Dropdown toggles
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("Last 30 Days");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);

  // Star state persisted locally
  const [starred, setStarred] = useState<string[]>([]);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);

  useEffect(() => {
    try {
      const rawCols = localStorage.getItem(COLS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount
      if (rawCols) setCols({ ...DEFAULT_COLS, ...JSON.parse(rawCols) });

      const rawStarred = localStorage.getItem("lp_starred_contacts");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same one-time init
      if (rawStarred) setStarred(JSON.parse(rawStarred));
    } catch { /* ignore malformed storage */ }
  }, []);

  function toggleCol(k: ColKey) {
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function openColsMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setColsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setShowCols(true);
  }

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarred((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("lp_starred_contacts", JSON.stringify(next)); } catch {}
      toast(prev.includes(id) ? "Removed star from contact" : "Starred contact successfully", "success");
      return next;
    });
  };

  const visibleCols = COLUMNS.filter((c) => cols[c.key]);
  const scoped = accountFilterId ? contacts.filter((c) => c.account_id === accountFilterId) : contacts;

  // Apply filters
  const filtered = scoped.filter((c) => {
    const q = search.toLowerCase();
    
    // Status Filter
    const status = c.email_opt_out ? "inactive" : "active";
    if (statusFilter !== "all" && status !== statusFilter) return false;

    // Search query
    if (!q) return true;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return (
      name.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.job_title?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.toLowerCase().includes(q) ?? false) ||
      (c.mailing_country?.toLowerCase().includes(q) ?? false)
    );
  });

  // Apply sorting
  const sorted = [...filtered].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
    if (sort === "name_az") return nameA.localeCompare(nameB);
    if (sort === "name_za") return nameB.localeCompare(nameA);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id));

  function openContact(id: string) {
    router.push(`/contacts/${id}`);
  }

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete contacts?", message: `Delete ${selected.length} contact(s)?`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteContacts(ids);
      toast(`${ids.length} contact(s) deleted.`, "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete contact?", message: "Delete this contact?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteContact(id);
      setSelected((s) => s.filter((x) => x !== id));
      toast("Contact deleted successfully", "success");
    });
  }

  const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"];

  function initials(c: ContactRow): string {
    const first = c.first_name || "";
    const last = c.last_name || "";
    if (first && last) {
      return (first[0] + last[0]).toUpperCase();
    }
    return first.slice(0, 2).toUpperCase() || last.slice(0, 2).toUpperCase() || "?";
  }

  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 pb-10 text-slate-800 dark:text-slate-700">
      
      {/* Redesigned Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
            <span className="bg-red-50 text-red-500 text-xs px-2 py-0.5 rounded-full font-bold dark:bg-rose-950/20 dark:text-rose-400">
              {scoped.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mt-1">
            <Link href="/dashboard" className="hover:text-slate-600">Home</Link>
            <span>&gt;</span>
            <span className="text-slate-600 dark:text-slate-600">Contacts</span>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Export Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="h-8 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1"
            >
              Export <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </Button>
            {exportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-36 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    toast("Exporting PDF contacts...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    toast("Exporting Excel contacts...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                >
                  Export Excel
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast("Refreshing contacts...", "info");
              router.refresh();
            }}
            className="h-8 w-8 p-0 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total contacts", value: scoped.length, icon: Users2, accent: "bg-amber-500" },
          { label: "Linked to account", value: scoped.filter((c) => c.account_id).length, icon: Link2, accent: "bg-blue-500" },
          { label: "Unassigned", value: scoped.filter((c) => !c.account_id).length, icon: User, accent: "bg-rose-500" },
          { label: "With email", value: scoped.filter((c) => c.email).length, icon: Mail, accent: "bg-emerald-500" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 sm:p-5 flex items-center gap-3">
              <span className={cn("h-11 w-11 rounded-full text-white flex items-center justify-center flex-shrink-0", s.accent)}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{s.label}</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{s.value.toLocaleString()}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Redesigned Sub-header / Actions Controls bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-2xs">
        
        {/* Left Side: Search, Sort, Date range */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="w-full sm:w-48 md:w-56 flex-shrink-0">
            <Input
              leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xs"
            />
          </div>

          {/* Sort By Dropdown Button */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Sort By: {sort === "name_az" ? "Name A-Z" : sort === "name_za" ? "Name Z-A" : sort === "newest" ? "Newest" : "None"}
              </span>
              <ChevronDown className="h-3 w-3 text-slate-450" />
            </Button>
            {sortDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                {[
                  { key: "none", label: "None" },
                  { key: "name_az", label: "Name A-Z" },
                  { key: "name_za", label: "Name Z-A" },
                  { key: "newest", label: "Newest" }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSort(opt.key as "none" | "name_az" | "name_za" | "newest");
                      setSortDropdownOpen(false);
                      toast(`Sorted contacts by ${opt.label}`, "success");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      sort === opt.key ? "text-rose-500 bg-rose-50/50 dark:bg-rose-950/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Picker Button */}
          <div className="relative">
            <button
              onClick={() => setDateRangeOpen(!dateRangeOpen)}
              className="h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>{activeDateRange}</span>
              <ChevronDown className="h-3 w-3 text-slate-400 ml-1" />
            </button>
            {dateRangeOpen && (
              <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                {["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setActiveDateRange(opt);
                      setDateRangeOpen(false);
                      toast(`Date range updated to ${opt}`, "success");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      activeDateRange === opt ? "text-rose-500 bg-rose-50/50 dark:bg-rose-950/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Add Contact, Filter, Columns, Toggle Grid */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          
          {/* Add Contacts Red Button */}
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="rounded-lg gap-1.5 font-bold h-8 px-3.5 text-xs bg-red-600 hover:bg-red-700 text-white shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Contacts</span>
          </Button>

          {/* Filter Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
            >
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Filter</span>
              <ChevronDown className="h-3 w-3 text-slate-450" />
            </Button>
            {filterDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Status</p>
                {[
                  { key: "all", label: "All Contacts" },
                  { key: "active", label: "Active" },
                  { key: "inactive", label: "Inactive" }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setStatusFilter(opt.key as "all" | "active" | "inactive");
                      setFilterDropdownOpen(false);
                      toast(`Filtering by status: ${opt.label}`, "info");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      statusFilter === opt.key ? "text-rose-500 bg-rose-50/50 dark:bg-rose-950/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manage Columns Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={openColsMenu}
            className="rounded-lg gap-1.5 font-semibold h-8 text-xs px-2.5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
            title="Manage Columns"
          >
            <Settings2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Manage Columns</span>
          </Button>

          {/* Layout Grid / List Toggler */}
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 shadow-2xs bg-slate-50/50 dark:bg-slate-900">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1 rounded-md transition-colors",
                viewMode === "list" ? "bg-emerald-500 text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="List View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1 rounded-md transition-colors",
                viewMode === "grid" ? "bg-emerald-500 text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="Grid View"
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
      </div>

      {/* FILTER NOTIFICATION BANNER */}
      {accountFilterId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-2">
          <p className="text-xs text-blue-950 dark:text-blue-200 font-semibold">
            Showing <span className="font-bold">{scoped.length}</span> contact{scoped.length === 1 ? "" : "s"} for this account
          </p>
          <Link href="/contacts" className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">Clear filter ✕</Link>
        </div>
      )}

      {/* RENDER VIEW: LIST OR GRID */}
      {viewMode === "list" ? (
        <Card className="overflow-hidden bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl">
          <div className="overflow-x-auto w-full">
            <DataTable className="min-w-[1000px] w-full text-slate-800 dark:text-slate-700">
              <DataTableHead className="sticky top-0 z-10 bg-slate-50/50 dark:bg-[var(--muted)] border-b border-slate-200/80 dark:border-slate-800">
                <tr className="text-left text-xs uppercase font-bold text-slate-500 dark:text-slate-500">
                  <DataTableTh className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-350 dark:border-slate-750"
                    />
                  </DataTableTh>
                  <DataTableTh className="px-3 py-2.5">Name</DataTableTh>
                  {cols.phone && <DataTableTh className="px-3 py-2.5">Phone</DataTableTh>}
                  {cols.tags && <DataTableTh className="px-3 py-2.5">Tags</DataTableTh>}
                  {cols.location && <DataTableTh className="px-3 py-2.5">Location</DataTableTh>}
                  {cols.rating && <DataTableTh className="px-3 py-2.5">Rating</DataTableTh>}
                  {cols.contact && <DataTableTh className="px-3 py-2.5 text-center">Contact</DataTableTh>}
                  {cols.status && <DataTableTh className="px-3 py-2.5">Status</DataTableTh>}
                  <DataTableTh className="w-12 px-3 py-2.5 text-center">Action</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.length === 0 && (
                  <DataTableEmpty colSpan={visibleCols.length + 3}>
                    No contacts found matching the filters. Click <strong>Add Contacts</strong> to create one.
                  </DataTableEmpty>
                )}
                {paged.map((c, i) => {
                  const isStarred = starred.includes(c.id);
                  const isChecked = selected.includes(c.id);
                  
                  // Consistent derived tags, flags, rating, status
                  const tagsList = ["Collab", "VIP", "Promotion"];
                  const tag = tagsList[hashCode(c.id) % tagsList.length];
                  const tagColor = tag === "Collab"
                    ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250 dark:border-emerald-800/40"
                    : tag === "VIP"
                      ? "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-250 dark:border-amber-800/40"
                      : "text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-rose-250 dark:border-rose-800/40";

                  const countries = ["USA", "UAE", "Germany", "France", "India", "Brazil", "Mexico"];
                  const countryName = c.mailing_country || countries[hashCode(c.id) % countries.length];
                  const flag = getFlagEmoji(countryName);

                  const rating = (3.0 + (hashCode(c.id) % 21) * 0.1).toFixed(1);

                  const status = c.email_opt_out ? "Inactive" : "Active";
                  const statusColor = status === "Active"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400";

                  return (
                    <DataTableRow
                      key={c.id}
                      onClick={() => openContact(c.id)}
                      className={cn(
                        "cursor-pointer text-xs font-semibold hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors",
                        isChecked && "bg-blue-50/20 dark:bg-blue-950/10"
                      )}
                    >
                      {/* Checkbox column */}
                      <DataTableTd onClick={(e) => e.stopPropagation()} className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(c.id)}
                          className="rounded border-slate-350 dark:border-slate-700"
                        />
                      </DataTableTd>

                      {/* Name with star & Avatar details */}
                      <DataTableTd className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => toggleStar(c.id, e)}
                            className="p-1 rounded-md text-slate-350 hover:text-amber-500 transition-colors"
                          >
                            <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                          </button>
                          
                          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-2xs", avatarColor(`${c.first_name} ${c.last_name}`))}>
                            {initials(c)}
                          </div>
                          
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate whitespace-nowrap mb-0.5 leading-none group-hover:text-blue-500">
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium truncate leading-none">
                              {c.job_title || "Facility Manager"}
                            </p>
                          </div>
                        </div>
                      </DataTableTd>

                      {/* Phone Column */}
                      {cols.phone && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 whitespace-nowrap font-medium">
                          {c.phone || "—"}
                        </td>
                      )}

                      {/* Tags Column */}
                      {cols.tags && (
                        <td className="px-3 py-2.5">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", tagColor)}>
                            {tag}
                          </span>
                        </td>
                      )}

                      {/* Location Column */}
                      {cols.location && (
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-500 font-medium">
                          <div className="flex items-center gap-1">
                            <span className="text-sm leading-none">{flag}</span>
                            <span>{countryName}</span>
                          </div>
                        </td>
                      )}

                      {/* Rating Column */}
                      {cols.rating && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-350">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                            <span>{rating}</span>
                          </div>
                        </td>
                      )}

                      {/* Contact Icons Column */}
                      {cols.contact && (
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <a
                              href={c.email ? `mailto:${c.email}` : "#"}
                              onClick={() => c.email && toast(`Opening mailto link for ${c.email}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={c.email || "No Email"}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={c.phone ? `tel:${c.phone}` : "#"}
                              onClick={() => c.phone && toast(`Opening call dialer for ${c.phone}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={c.phone || "No Phone"}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => toast(`Starting quick chat with ${c.first_name}...`, "info")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Message"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openContact(c.id)}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Status Column */}
                      {cols.status && (
                        <td className="px-3 py-2.5">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", statusColor)}>
                            {status}
                          </span>
                        </td>
                      )}

                      {/* Action Menu Column */}
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setRowMenu({ id: c.id, top: r.bottom + 4, left: Math.max(8, r.right - 140) });
                          }}
                          title="Row actions"
                          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                        >
                          <MoreVertical className="h-4 w-4 text-slate-400" />
                        </button>
                      </td>

                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </div>
        </Card>
      ) : (
        /* Redesigned Contacts Grid View Mode */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE).map((c) => {
            const isStarred = starred.includes(c.id);
            const tagsList = ["Collab", "VIP", "Promotion"];
            const tag = tagsList[hashCode(c.id) % tagsList.length];
            const tagColor = tag === "Collab"
              ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250"
              : tag === "VIP"
                ? "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-250"
                : "text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-rose-250";

            const countries = ["USA", "UAE", "Germany", "France", "India", "Brazil", "Mexico"];
            const countryName = c.mailing_country || countries[hashCode(c.id) % countries.length];
            const flag = getFlagEmoji(countryName);
            const rating = (3.0 + (hashCode(c.id) % 21) * 0.1).toFixed(1);

            const status = c.email_opt_out ? "Inactive" : "Active";
            const statusColor = status === "Active"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400";

            return (
              <Card
                key={c.id}
                onClick={() => openContact(c.id)}
                className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl p-4 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex flex-col justify-between relative group"
              >
                {/* Star top-left & Status top-right */}
                <div className="flex justify-between items-center mb-3">
                  <button
                    type="button"
                    onClick={(e) => toggleStar(c.id, e)}
                    className="p-1 rounded-md text-slate-300 hover:text-amber-500"
                  >
                    <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                  </button>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", statusColor)}>
                    {status}
                  </span>
                </div>

                {/* Profile Avatar, Name, Job title */}
                <div className="flex flex-col items-center text-center mb-4 flex-1">
                  <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm mb-2.5", avatarColor(`${c.first_name} ${c.last_name}`))}>
                    {initials(c)}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-500">
                    {c.first_name} {c.last_name}
                  </h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">{c.job_title || "Facility Manager"}</p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-2 text-xs font-semibold">
                  {/* Phone / Location / Rating */}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="text-slate-800 dark:text-slate-700">{c.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location:</span>
                    <span className="text-slate-800 dark:text-slate-700 flex items-center gap-1">
                      <span>{flag}</span>
                      <span>{countryName}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rating:</span>
                    <span className="text-slate-800 dark:text-slate-700 flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span>{rating}</span>
                    </span>
                  </div>
                </div>

                {/* Grid contact quick action footer */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3 flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={c.email ? `mailto:${c.email}` : "#"}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                  <a
                    href={c.phone ? `tel:${c.phone}` : "#"}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 hover:bg-slate-50"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => toast(`Starting quick chat with ${c.first_name}...`, "info")}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openContact(c.id)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-indigo-500 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination component */}
      <div className="mt-5">
        <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
      </div>

      {/* Modal overlays */}
      <EditContactModal open={showModal} onClose={() => setShowModal(false)} defaultAccountId={accountFilterId || undefined} />
      {editingContact && (
        <EditContactModal open={true} onClose={() => setEditingContact(null)} contact={editingContact} />
      )}

      {/* Row actions menu — kebab button in the rightmost column, Edit + Delete */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div className="fixed z-50 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1" style={{ top: rowMenu.top, left: rowMenu.left }}>
            <button
              onClick={() => {
                const contact = contacts.find((x) => x.id === rowMenu.id);
                setRowMenu(null);
                if (contact) setEditingContact(contact);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => {
                const id = rowMenu.id;
                setRowMenu(null);
                handleDelete(id);
              }}
              disabled={pending}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-rose-950/50 rounded-lg disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}

      {/* Columns customizer floating panel */}
      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div className="fixed z-50 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2" style={{ top: colsPos.top, right: colsPos.right }}>
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-600 font-semibold">
                  <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} className="rounded border-slate-350 text-blue-600 focus:ring-blue-500" />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bulk actions status panel floating */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 pl-5 pr-3 py-2.5">
            <span className="text-sm font-semibold whitespace-nowrap">
              <span className="font-extrabold">{selected.length}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            <button onClick={handleBulkDelete} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 px-3.5 py-1.5 text-sm font-bold transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button onClick={() => setSelected([])} className="rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-bold transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
