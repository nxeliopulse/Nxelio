"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Trash2, ChevronDown, Building2, ArrowUpDown, Settings2,
  Phone, Globe, MessageSquare, Eye, MoreVertical, Star, Calendar, Filter, Grid, List,
  Briefcase, Flame, Target, Pencil, RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { EditAccountModal } from "@/components/accounts/edit-account-modal";
import { deleteAccount, bulkDeleteAccounts, type AccountRow } from "@/lib/queries/accounts";

type ColKey = "phone" | "tags" | "location" | "rating" | "contact" | "type";

interface ColumnDef { key: ColKey; label: string; defaultOn: boolean }

const COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Phone", defaultOn: true },
  { key: "tags", label: "Tags", defaultOn: true },
  { key: "location", label: "Location", defaultOn: true },
  { key: "rating", label: "Rating", defaultOn: true },
  { key: "contact", label: "Contact", defaultOn: true },
  { key: "type", label: "Type", defaultOn: true },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_accounts_columns_redesign";
const PAGE_SIZE = 15;

function getFlagEmoji(country: string): string {
  const c = country.toLowerCase();
  if (c.includes("united states") || c.includes("usa")) return "🇺🇸";
  if (c.includes("canada")) return "🇨🇦";
  if (c.includes("united kingdom") || c.includes("uk")) return "🇬🇧";
  if (c.includes("australia")) return "🇦🇺";
  if (c.includes("india")) return "🇮🇳";
  if (c.includes("germany")) return "🇩🇪";
  if (c.includes("france")) return "🇫🇷";
  if (c.includes("japan")) return "🇯🇵";
  return "🌐";
}

function ownershipColor(value: string | null): string {
  switch (value) {
    case "Public": return "text-blue-500 bg-blue-50 dark:bg-blue-950/20 border-blue-250 dark:border-blue-800/40";
    case "Private": return "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250 dark:border-emerald-800/40";
    case "Subsidiary": return "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-250 dark:border-amber-800/40";
    default: return "text-slate-500 bg-slate-50 dark:bg-[var(--muted)] border-slate-250 dark:border-slate-700";
  }
}

function accountTypeColor(value: string | null): string {
  switch (value) {
    case "Customer": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400";
    case "Prospect": return "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
    case "Partner": return "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400";
    case "Competitor": return "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400";
    case "Vendor": return "bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-400";
    case "Investor": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-400";
    case "Reseller": return "bg-pink-100 text-pink-800 dark:bg-pink-950/30 dark:text-pink-400";
    case "Analyst": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400";
    default: return "bg-slate-100 text-slate-700 dark:bg-[var(--muted)] dark:text-slate-600";
  }
}

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
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
  const [ratingFilter, setRatingFilter] = useState<"all" | "Hot" | "Warm" | "Cold">("all");

  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);

  // Star state persisted locally
  const [starred, setStarred] = useState<string[]>([]);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);

  useEffect(() => {
    try {
      const rawCols = localStorage.getItem(COLS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount
      if (rawCols) setCols({ ...DEFAULT_COLS, ...JSON.parse(rawCols) });

      const rawStarred = localStorage.getItem("lp_starred_accounts");
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
      try { localStorage.setItem("lp_starred_accounts", JSON.stringify(next)); } catch {}
      toast(prev.includes(id) ? "Removed star from account" : "Starred account successfully", "success");
      return next;
    });
  };

  const visibleCols = COLUMNS.filter((c) => cols[c.key]);

  // Apply filters
  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();

    // Rating Filter
    if (ratingFilter !== "all" && a.rating !== ratingFilter) return false;

    // Search query
    if (!q) return true;
    return (
      a.account_name.toLowerCase().includes(q) ||
      (a.industry?.toLowerCase().includes(q) ?? false) ||
      (a.website?.toLowerCase().includes(q) ?? false) ||
      (a.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  // Apply sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name_az") return a.account_name.localeCompare(b.account_name);
    if (sort === "name_za") return b.account_name.localeCompare(a.account_name);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((a) => a.id));

  function openAccount(id: string) {
    router.push(`/accounts/${id}`);
  }

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete accounts?", message: `Delete ${selected.length} account(s)?`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteAccounts(ids);
      toast(`${ids.length} account(s) deleted.`, "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete account?", message: "Delete this account?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteAccount(id);
      setSelected((s) => s.filter((x) => x !== id));
      toast("Account deleted successfully", "success");
    });
  }

  const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"];

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
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Accounts</h1>
            <span className="bg-red-50 text-red-500 text-xs px-2 py-0.5 rounded-full font-bold dark:bg-rose-950/20 dark:text-rose-400">
              {accounts.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mt-1">
            <Link href="/dashboard" className="hover:text-slate-600">Home</Link>
            <span>&gt;</span>
            <span className="text-slate-600 dark:text-slate-600">Accounts</span>
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
                    toast("Exporting PDF accounts...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    toast("Exporting Excel accounts...", "info");
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
              toast("Refreshing accounts...", "info");
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
          { label: "Total accounts", value: accounts.length, icon: Building2, accent: "bg-amber-500" },
          { label: "Customers", value: accounts.filter((a) => a.account_type === "Customer").length, icon: Briefcase, accent: "bg-blue-500" },
          { label: "Prospects", value: accounts.filter((a) => a.account_type === "Prospect").length, icon: Target, accent: "bg-emerald-500" },
          { label: "Hot accounts", value: accounts.filter((a) => a.rating === "Hot").length, icon: Flame, accent: "bg-rose-500" },
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
                      toast(`Sorted accounts by ${opt.label}`, "success");
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

        {/* Right Side: Add Account, Filter, Columns, Toggle Grid */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">

          {/* Add Account Red Button */}
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="rounded-lg gap-1.5 font-bold h-8 px-3.5 text-xs bg-red-600 hover:bg-red-700 text-white shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Account</span>
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
                <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Rating</p>
                {[
                  { key: "all", label: "All Accounts" },
                  { key: "Hot", label: "Hot" },
                  { key: "Warm", label: "Warm" },
                  { key: "Cold", label: "Cold" }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setRatingFilter(opt.key as "all" | "Hot" | "Warm" | "Cold");
                      setFilterDropdownOpen(false);
                      toast(`Filtering by rating: ${opt.label}`, "info");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      ratingFilter === opt.key ? "text-rose-500 bg-rose-50/50 dark:bg-rose-950/20" : "text-slate-700 dark:text-slate-600"
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
                  {cols.type && <DataTableTh className="px-3 py-2.5">Type</DataTableTh>}
                  <DataTableTh className="w-12 px-3 py-2.5 text-center">Action</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.length === 0 && (
                  <DataTableEmpty colSpan={visibleCols.length + 3}>
                    No accounts found matching the filters. Click <strong>Add Account</strong> to create one.
                  </DataTableEmpty>
                )}
                {paged.map((a) => {
                  const isStarred = starred.includes(a.id);
                  const isChecked = selected.includes(a.id);

                  const countryName = a.billing_country;
                  const flag = countryName ? getFlagEmoji(countryName) : null;

                  return (
                    <DataTableRow
                      key={a.id}
                      onClick={() => openAccount(a.id)}
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
                          onChange={() => toggle(a.id)}
                          className="rounded border-slate-350 dark:border-slate-700"
                        />
                      </DataTableTd>

                      {/* Name with star & Avatar details */}
                      <DataTableTd className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => toggleStar(a.id, e)}
                            className="p-1 rounded-md text-slate-350 hover:text-amber-500 transition-colors"
                          >
                            <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                          </button>

                          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-2xs", avatarColor(a.account_name))}>
                            {a.account_name.trim()[0]?.toUpperCase() || "?"}
                          </div>

                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate whitespace-nowrap mb-0.5 leading-none group-hover:text-blue-500">
                              {a.account_name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium truncate leading-none">
                              {a.industry || "—"}
                            </p>
                          </div>
                        </div>
                      </DataTableTd>

                      {/* Phone Column */}
                      {cols.phone && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 whitespace-nowrap font-medium">
                          {a.phone || "—"}
                        </td>
                      )}

                      {/* Tags Column (Ownership) */}
                      {cols.tags && (
                        <td className="px-3 py-2.5">
                          {a.ownership ? (
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", ownershipColor(a.ownership))}>
                              {a.ownership}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Location Column */}
                      {cols.location && (
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-500 font-medium">
                          {countryName ? (
                            <div className="flex items-center gap-1">
                              <span className="text-sm leading-none">{flag}</span>
                              <span>{[a.billing_city, countryName].filter(Boolean).join(", ")}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Rating Column */}
                      {cols.rating && (
                        <td className="px-3 py-2.5">
                          {a.rating ? (
                            <Badge variant={a.rating === "Hot" ? "danger" : a.rating === "Warm" ? "warning" : "blue"}>{a.rating}</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Contact Icons Column */}
                      {cols.contact && (
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <a
                              href={a.website ? (a.website.startsWith("http") ? a.website : `https://${a.website}`) : "#"}
                              target={a.website ? "_blank" : undefined}
                              rel="noopener noreferrer"
                              onClick={() => a.website && toast(`Opening website for ${a.account_name}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={a.website || "No Website"}
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={a.phone ? `tel:${a.phone}` : "#"}
                              onClick={() => a.phone && toast(`Opening call dialer for ${a.phone}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={a.phone || "No Phone"}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => toast(`Starting quick chat with ${a.account_name}...`, "info")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Message"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openAccount(a.id)}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Type Column */}
                      {cols.type && (
                        <td className="px-3 py-2.5">
                          {a.account_type ? (
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", accountTypeColor(a.account_type))}>
                              {a.account_type}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Action Menu Column */}
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setRowMenu({ id: a.id, top: r.bottom + 4, left: Math.max(8, r.right - 140) });
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
        /* Redesigned Accounts Grid View Mode */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE).map((a) => {
            const isStarred = starred.includes(a.id);
            const countryName = a.billing_country;
            const flag = countryName ? getFlagEmoji(countryName) : null;

            return (
              <Card
                key={a.id}
                onClick={() => openAccount(a.id)}
                className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl p-4 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex flex-col justify-between relative group"
              >
                {/* Star top-left & Type top-right */}
                <div className="flex justify-between items-center mb-3">
                  <button
                    type="button"
                    onClick={(e) => toggleStar(a.id, e)}
                    className="p-1 rounded-md text-slate-300 hover:text-amber-500"
                  >
                    <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                  </button>
                  {a.account_type ? (
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", accountTypeColor(a.account_type))}>
                      {a.account_type}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">—</span>
                  )}
                </div>

                {/* Avatar, Name, Industry */}
                <div className="flex flex-col items-center text-center mb-4 flex-1">
                  <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm mb-2.5", avatarColor(a.account_name))}>
                    {a.account_name.trim()[0]?.toUpperCase() || "?"}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-500">
                    {a.account_name}
                  </h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">{a.industry || "—"}</p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-2 text-xs font-semibold">
                  {/* Phone / Location / Rating */}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="text-slate-800 dark:text-slate-700">{a.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location:</span>
                    <span className="text-slate-800 dark:text-slate-700 flex items-center gap-1">
                      {countryName ? (
                        <>
                          <span>{flag}</span>
                          <span>{[a.billing_city, countryName].filter(Boolean).join(", ")}</span>
                        </>
                      ) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Rating:</span>
                    {a.rating ? (
                      <Badge variant={a.rating === "Hot" ? "danger" : a.rating === "Warm" ? "warning" : "blue"}>{a.rating}</Badge>
                    ) : (
                      <span className="text-slate-800 dark:text-slate-700">—</span>
                    )}
                  </div>
                </div>

                {/* Grid contact quick action footer */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3 flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={a.website ? (a.website.startsWith("http") ? a.website : `https://${a.website}`) : "#"}
                    target={a.website ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                  <a
                    href={a.phone ? `tel:${a.phone}` : "#"}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 hover:bg-slate-50"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => toast(`Starting quick chat with ${a.account_name}...`, "info")}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openAccount(a.id)}
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
      <EditAccountModal open={showModal} onClose={() => setShowModal(false)} />
      {editingAccount && (
        <EditAccountModal open={true} onClose={() => setEditingAccount(null)} account={editingAccount} />
      )}

      {/* Row actions menu — kebab button in the rightmost column, Edit + Delete */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div className="fixed z-50 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1" style={{ top: rowMenu.top, left: rowMenu.left }}>
            <button
              onClick={() => {
                const acc = accounts.find((x) => x.id === rowMenu.id);
                setRowMenu(null);
                if (acc) setEditingAccount(acc);
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
