"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, ChevronDown, Building2, ArrowUpDown, ArrowUp, ArrowDown, Settings2,
  Phone, Globe, MessageSquare, Eye, MoreVertical, Star, Calendar, Filter, Grid, List,
  Pencil, RefreshCw, Download, FileText, FileSpreadsheet, Upload
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { cn, formatDate } from "@/lib/utils";
import { EditAccountModal, type AccountOwnerOption } from "@/components/accounts/edit-account-modal";
import { AddAccountsWizard } from "@/components/accounts/add-accounts-wizard";
import { type AccountRow } from "@/lib/queries/accounts";

// "index" (Row #) is NOT part of this list — like leads-table.tsx's own Row #
// column, it's always shown and fixed in position, never toggleable.
type ColKey = "phone" | "tags" | "location" | "rating" | "contact" | "type" | "owner" | "created_at";

interface ColumnDef { key: ColKey; label: string; defaultOn: boolean }

// Every column with real comparable data is sortable — "name" (the fixed, always-shown
// Name column, so it's not part of ColKey/COLUMNS) plus every ColKey except "contact"
// (icon-only quick-action buttons, not real data). Matches leads-table.tsx's own pattern
// of excluding non-sortable columns (its Row # column and any icon-only columns).
type SortKey = "name" | Exclude<ColKey, "contact">;

const COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Phone", defaultOn: true },
  { key: "tags", label: "Tags", defaultOn: true },
  { key: "location", label: "Location", defaultOn: true },
  { key: "rating", label: "Rating", defaultOn: true },
  { key: "contact", label: "Contact", defaultOn: true },
  { key: "type", label: "Type", defaultOn: true },
  { key: "owner", label: "Owner", defaultOn: true },
  { key: "created_at", label: "Created Date", defaultOn: true },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_accounts_columns_redesign";
const PAGE_SIZE = 15;

// Matches the fixed option lists in edit-account-modal.tsx, so the toolbar filters
// only ever offer values that are actually selectable when creating/editing an account.
const STATUS_OPTIONS = ["Active", "Inactive", "Prospect", "On Hold", "Churned"];
const INDUSTRY_OPTIONS = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Consulting", "Other"];
const ACCOUNT_TYPE_OPTIONS = ["Analyst", "Competitor", "Customer", "Integrator", "Investor", "Partner", "Prospect", "Reseller", "Vendor", "Other"];

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

export function AccountsTable({ accounts, owners = [] }: { accounts: AccountRow[]; owners?: AccountOwnerOption[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [nowMs] = useState(() => Date.now());

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  // Per-column header sort — click any column's arrow to sort by it, click again to flip
  // direction. The "Sort By" toolbar dropdown below is just a few named presets over this
  // same state (see SORT_PRESETS), so both controls always stay in sync — matches the
  // shared sortKey/sortDir mechanism in leads-table.tsx.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleColumnSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  const [page, setPage] = useState(0);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Dropdown toggles
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("Last 30 Days");
  const [ratingFilter, setRatingFilter] = useState<"all" | "Hot" | "Warm" | "Cold">("all");

  // Toolbar filter dropdowns — Status/Industries/Owners/Regions ("all" = no filter
  // applied). Account Type joins Rating inside "More Filters" rather than getting
  // its own toolbar slot, to keep the primary row matching the reference exactly.
  const [statusFilter, setStatusFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);

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

  // "Region" has no fixed enum elsewhere in the app (unlike Status/Industry/Type,
  // which mirror edit-account-modal.tsx's dropdowns) — derived from real billing
  // countries actually present in the data instead of a guessed-at fixed list.
  const REGION_OPTIONS = Array.from(
    new Set(accounts.map((a) => a.billing_country).filter((c): c is string => Boolean(c)))
  ).sort((a, b) => a.localeCompare(b));

  // Apply filters
  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();

    if (ratingFilter !== "all" && a.rating !== ratingFilter) return false;
    if (statusFilter !== "all" && a.account_status !== statusFilter) return false;
    if (industryFilter !== "all" && a.industry !== industryFilter) return false;
    if (ownerFilter !== "all" && a.account_owner !== ownerFilter) return false;
    if (regionFilter !== "all" && a.billing_country !== regionFilter) return false;
    if (accountTypeFilter !== "all" && a.account_type !== accountTypeFilter) return false;

    // Search query — matches the "name, domain, industry, or owner" the placeholder promises,
    // plus website/phone as a bonus (kept from the original search).
    if (!q) return true;
    const ownerName = owners.find((o) => o.id === a.account_owner)?.name;
    return (
      a.account_name.toLowerCase().includes(q) ||
      (a.domain?.toLowerCase().includes(q) ?? false) ||
      (a.industry?.toLowerCase().includes(q) ?? false) ||
      (a.website?.toLowerCase().includes(q) ?? false) ||
      (a.phone?.toLowerCase().includes(q) ?? false) ||
      (ownerName?.toLowerCase().includes(q) ?? false)
    );
  });

  /** Ordered coldest→hottest so ascending reads like a plain numeric scale (Cold, Warm, Hot)
   *  and descending flips to hottest-first; accounts with no rating rank lowest (sort first
   *  ascending, last descending) — same convention as every other column's empty values. */
  const RATING_RANK: Record<string, number> = { Cold: 1, Warm: 2, Hot: 3 };

  /** One comparator per sortable column, all following the same asc/desc flip convention.
   *  Missing/null values compare as "" (or rank 0 for rating) so they sort first ascending —
   *  except phone, which is explicitly pinned last in BOTH directions per spec. */
  function compareAccounts(a: AccountRow, b: AccountRow, key: SortKey, dir: "asc" | "desc"): number {
    switch (key) {
      case "name": {
        const cmp = a.account_name.localeCompare(b.account_name, undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "phone": {
        // Null/blank phone numbers always sort last, regardless of direction.
        const aEmpty = !a.phone;
        const bEmpty = !b.phone;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        const cmp = a.phone!.localeCompare(b.phone!, undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "tags": {
        // "Tags" column renders the ownership value (Public/Private/Subsidiary).
        const cmp = (a.ownership || "").localeCompare(b.ownership || "", undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "location": {
        const countryCmp = (a.billing_country || "").localeCompare(b.billing_country || "", undefined, { numeric: true, sensitivity: "base" });
        const cmp = countryCmp !== 0
          ? countryCmp
          : (a.billing_city || "").localeCompare(b.billing_city || "", undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "rating": {
        const av = (a.rating && RATING_RANK[a.rating]) || 0;
        const bv = (b.rating && RATING_RANK[b.rating]) || 0;
        const cmp = av - bv;
        return dir === "asc" ? cmp : -cmp;
      }
      case "type": {
        const cmp = (a.account_type || "").localeCompare(b.account_type || "", undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "owner": {
        // account_owner is a UUID — compare by the resolved display name, not the raw id.
        const an = owners.find((o) => o.id === a.account_owner)?.name || "";
        const bn = owners.find((o) => o.id === b.account_owner)?.name || "";
        const cmp = an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      }
      case "created_at": {
        const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return dir === "asc" ? cmp : -cmp;
      }
      default:
        return 0;
    }
  }

  // Apply sorting — per-column header arrows and the "Sort By" toolbar dropdown both just
  // drive sortKey/sortDir, so there is exactly one sort mechanism to keep in sync.
  const sorted = [...filtered].sort((a, b) => (sortKey ? compareAccounts(a, b, sortKey, sortDir) : 0));

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((a) => a.id));

  function openAccount(id: string) {
    router.push(`/accounts/${id}`);
  }

  const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"];

  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  // Named "Sort By" presets — each is just a shortcut that sets sortKey/sortDir to a
  // specific value, so choosing one here and clicking a column's header arrow always
  // agree on what "currently sorted" means (same state, no parallel sort mechanism).
  const SORT_PRESETS: { key: string; label: string; apply: () => void; isActive: () => boolean }[] = [
    { key: "none", label: "None", apply: () => { setSortKey(null); setSortDir("asc"); }, isActive: () => !sortKey },
    { key: "name_az", label: "Name A-Z", apply: () => { setSortKey("name"); setSortDir("asc"); }, isActive: () => sortKey === "name" && sortDir === "asc" },
    { key: "name_za", label: "Name Z-A", apply: () => { setSortKey("name"); setSortDir("desc"); }, isActive: () => sortKey === "name" && sortDir === "desc" },
    { key: "newest", label: "Newest", apply: () => { setSortKey("created_at"); setSortDir("desc"); }, isActive: () => sortKey === "created_at" && sortDir === "desc" },
  ];

  /** Label shown on the "Sort By" toolbar button — falls back to "<Column> asc/desc" when
   *  the active sort was set via a column header arrow rather than one of the named presets. */
  function sortByLabel(): string {
    if (!sortKey) return "None";
    const preset = SORT_PRESETS.find((p) => p.key !== "none" && p.isActive());
    if (preset) return preset.label;
    const label = sortKey === "name" ? "Name" : COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey;
    return `${label} ${sortDir === "asc" ? "↑" : "↓"}`;
  }

  /** Small per-column sort-arrow button next to a header label — neutral gray ArrowUpDown
   *  when this column isn't the active sort, colored ArrowUp/ArrowDown when it is. Matches
   *  leads-table.tsx's own header sort control exactly. */
  function renderSortButton(key: SortKey) {
    const isSorted = sortKey === key;
    const label = key === "name" ? "Name" : COLUMNS.find((c) => c.key === key)?.label ?? key;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleColumnSort(key); }}
        title={`Sort by ${label}`}
        className={cn("p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700", isSorted && "text-blue-600 dark:text-blue-400")}
      >
        {isSorted ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-400" />
        )}
      </button>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 pb-10 text-slate-800 dark:text-slate-700">

      {/* Redesigned Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Accounts</h1>
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
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="h-8 rounded-md bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {exportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    toast("Exporting PDF accounts...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-400" /> Export as PDF
                </button>
                <button
                  onClick={() => {
                    toast("Exporting Excel accounts...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" /> Export as Excel
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportWizard(true)}
            className="h-8 w-8 p-0 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            title="Import CSV"
          >
            <Upload className="h-4 w-4 text-slate-500" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast("Refreshing accounts...", "info");
              router.refresh();
              setTimeout(() => window.location.reload(), 100);
            }}
            className="h-8 w-8 p-0 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {(() => {
        // "vs last 30 days" is computed from created_at, which is the only
        // historical signal we actually have (no snapshot/audit table tracks
        // status changes over time). For "Total" this is an exact comparison.
        // For status/type-based counts it's an approximation — an account
        // could have changed status since it was created — but it's a real,
        // derived number rather than a fabricated one.
        const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
        const pctChange = (matches: (a: AccountRow) => boolean) => {
          const current = accounts.filter(matches).length;
          const previous = accounts.filter((a) => matches(a) && new Date(a.created_at).getTime() <= cutoff).length;
          if (previous === 0) return current > 0 ? 100 : 0;
          return Math.round(((current - previous) / previous) * 100);
        };
        const cards = [
          { label: "Total Accounts", value: accounts.length, pct: pctChange(() => true) },
          { label: "Active Accounts", value: accounts.filter((a) => a.account_status === "Active").length, pct: pctChange((a) => a.account_status === "Active") },
          { label: "Prospect Accounts", value: accounts.filter((a) => a.account_status === "Prospect").length, pct: pctChange((a) => a.account_status === "Prospect") },
          { label: "Customer Accounts", value: accounts.filter((a) => a.account_type === "Customer").length, pct: pctChange((a) => a.account_type === "Customer") },
          { label: "Inactive Accounts", value: accounts.filter((a) => a.account_status === "Inactive").length, pct: pctChange((a) => a.account_status === "Inactive") },
        ];
        return (
          <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 mb-5 overflow-hidden">
            {cards.map((s) => (
              <div key={s.label} className="p-4 sm:p-5 min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 truncate">{s.label}</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{s.value.toLocaleString()}</p>
                <p className={cn("text-[11px] font-semibold mt-1 flex items-center gap-0.5", s.pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  {s.pct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(s.pct)}% vs last 30 days
                </p>
              </div>
            ))}
          </Card>
        );
      })()}

      {/* Redesigned Sub-header / Actions Controls bar: Row 1 */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-2xs">

        {/* Left Side: Search Bar */}
        <div className="w-full md:w-auto flex-grow max-w-md">
          <Input
            leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
            placeholder="Search accounts by name, domain, industry, or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xs"
          />
        </div>

        {/* Right Side: Filter, Columns, Toggle Grid */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">

<<<<<<< HEAD
          {/* More Filters — Rating + Account Type, the two filter dimensions that don't
              have their own dedicated toolbar dropdown (Status/Industry/Owner/Region do) */}
=======
          {/* Add Account Button */}
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="rounded-lg gap-1.5 font-bold h-8 px-3.5 text-xs bg-[var(--primary)] hover:opacity-90 text-white shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Account</span>
          </Button>

          {/* More Filters — Rating + Account Type */}
>>>>>>> 1b1a8d2 (Mani)
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
            >
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>More Filters</span>
              {(ratingFilter !== "all" || accountTypeFilter !== "all") && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              )}
              <ChevronDown className="h-3 w-3 text-slate-450" />
            </Button>
            {filterDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterDropdownOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-48 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rating</p>
                  {[
                    { key: "all", label: "All Ratings" },
                    { key: "Hot", label: "Hot" },
                    { key: "Warm", label: "Warm" },
                    { key: "Cold", label: "Cold" }
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setRatingFilter(opt.key as "all" | "Hot" | "Warm" | "Cold");
                        toast(`Filtering by rating: ${opt.label}`, "info");
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                        ratingFilter === opt.key ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <p className="px-3 py-1.5 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-t border-slate-100 dark:border-slate-800 pt-2">Account Type</p>
                  {["all", ...ACCOUNT_TYPE_OPTIONS].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setAccountTypeFilter(opt);
                        toast(`Filtering by account type: ${opt === "all" ? "All Types" : opt}`, "info");
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                        accountTypeFilter === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                      )}
                    >
                      {opt === "all" ? "All Types" : opt}
                    </button>
                  ))}
                </div>
              </>
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
                viewMode === "list" ? "bg-[var(--primary)] text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="List View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1 rounded-md transition-colors",
                viewMode === "grid" ? "bg-[var(--primary)] text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="Grid View"
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
      </div>

      {/* Redesigned Sub-header / Actions Controls bar: Row 2 */}
      <div className="flex flex-wrap items-center gap-2 mb-5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-2xs w-full">

        {/* Status Filter */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <span>{statusFilter === "all" ? "All Status" : statusFilter}</span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {statusDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                {["all", ...STATUS_OPTIONS].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setStatusFilter(opt); setStatusDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      statusFilter === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt === "all" ? "All Status" : opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Industry Filter */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIndustryDropdownOpen(!industryDropdownOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <span>{industryFilter === "all" ? "All Industries" : industryFilter}</span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {industryDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIndustryDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-44 max-h-72 overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                {["all", ...INDUSTRY_OPTIONS].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setIndustryFilter(opt); setIndustryDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      industryFilter === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt === "all" ? "All Industries" : opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Owner Filter */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOwnerDropdownOpen(!ownerDropdownOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <span>{ownerFilter === "all" ? "All Owners" : (owners.find((o) => o.id === ownerFilter)?.name ?? "Unknown owner")}</span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {ownerDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOwnerDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-44 max-h-72 overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <button
                  onClick={() => { setOwnerFilter("all"); setOwnerDropdownOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                    ownerFilter === "all" ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                  )}
                >
                  All Owners
                </button>
                {owners.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setOwnerFilter(o.id); setOwnerDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      ownerFilter === o.id ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Region Filter */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRegionDropdownOpen(!regionDropdownOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <span>{regionFilter === "all" ? "All Regions" : regionFilter}</span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {regionDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRegionDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-44 max-h-72 overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <button
                  onClick={() => { setRegionFilter("all"); setRegionDropdownOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                    regionFilter === "all" ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                  )}
                >
                  All Regions
                </button>
                {REGION_OPTIONS.length === 0 && (
                  <p className="px-4 py-2 text-slate-400">No regions yet</p>
                )}
                {REGION_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setRegionFilter(opt); setRegionDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      regionFilter === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Count Chip — matches leads-table.tsx's bordered icon+count pill */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 flex-shrink-0 whitespace-nowrap">
          <Building2 className="h-3.5 w-3.5 text-slate-400" />
          <span>{filtered.length} Account{filtered.length === 1 ? "" : "s"}</span>
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
              Sort By: {sortByLabel()}
            </span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {sortDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
              {SORT_PRESETS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    opt.apply();
                    setSortDropdownOpen(false);
                    toast(`Sorted accounts by ${opt.label}`, "success");
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                    opt.isActive() ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
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
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span>{activeDateRange}</span>
            <ChevronDown className="h-3 w-3 text-slate-400 ml-1" />
          </button>
          {dateRangeOpen && (
            <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
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
                    activeDateRange === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20" : "text-slate-700 dark:text-slate-600"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
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
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                    />
                  </DataTableTh>
                  {/* Row # — always shown, fixed position, not part of the Manage Columns toggle (matches leads-table.tsx) */}
                  <DataTableTh className="w-10 px-3 py-2.5">#</DataTableTh>
                  <DataTableTh className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">Name{renderSortButton("name")}</span>
                  </DataTableTh>
                  {cols.phone && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Phone{renderSortButton("phone")}</span>
                    </DataTableTh>
                  )}
                  {cols.tags && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Tags{renderSortButton("tags")}</span>
                    </DataTableTh>
                  )}
                  {cols.location && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Location{renderSortButton("location")}</span>
                    </DataTableTh>
                  )}
                  {cols.rating && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Rating{renderSortButton("rating")}</span>
                    </DataTableTh>
                  )}
                  {cols.contact && <DataTableTh className="px-3 py-2.5 text-center">Contact</DataTableTh>}
                  {cols.type && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Type{renderSortButton("type")}</span>
                    </DataTableTh>
                  )}
                  {cols.owner && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Owner{renderSortButton("owner")}</span>
                    </DataTableTh>
                  )}
                  {cols.created_at && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Created Date{renderSortButton("created_at")}</span>
                    </DataTableTh>
                  )}
                  <DataTableTh className="w-12 px-3 py-2.5 text-center">Action</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.length === 0 && (
                  <DataTableEmpty colSpan={visibleCols.length + 4}>
                    No accounts found matching the filters.
                  </DataTableEmpty>
                )}
                {paged.map((a, i) => {
                  const isStarred = starred.includes(a.id);
                  const isChecked = selected.includes(a.id);
                  const rowNumber = safePage * PAGE_SIZE + i + 1;

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
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                        />
                      </DataTableTd>

                      {/* Row # — always shown, matches leads-table.tsx's Row # column */}
                      <DataTableTd className="px-3 py-2.5">
                        <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono text-xs">{rowNumber}</span>
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

                      {/* Phone Column — matches leads-table.tsx's "+ Add phone" quick-fill treatment */}
                      {cols.phone && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 whitespace-nowrap font-medium">
                          {a.phone || (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingAccount(a); }}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
                            >
                              <Plus className="h-3 w-3" /> Add phone
                            </button>
                          )}
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
                            {a.website ? (
                              <a
                                href={a.website.startsWith("http") ? a.website : `https://${a.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => toast(`Opening website for ${a.account_name}`, "success")}
                                className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                                title={a.website}
                              >
                                <Globe className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              // Quick-fill — matches leads-table.tsx's "+ Add website" treatment for an empty
                              // value, adapted to this row's icon-button layout; opens the existing Edit modal.
                              <button
                                type="button"
                                onClick={() => setEditingAccount(a)}
                                className="p-1 rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70"
                                title="Add website"
                              >
                                <Globe className="h-3.5 w-3.5" />
                              </button>
                            )}
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

                      {/* Owner Column — colored-initial avatar + name, matches leads-table.tsx's Owner cell.
                          account_owner is a UUID (accounts.account_owner references users.user_id) — look
                          up the display name via the owners prop rather than rendering the id directly. */}
                      {cols.owner && (
                        <td className="px-3 py-2.5">
                          {(() => {
                            const ownerName = owners.find((o) => o.id === a.account_owner)?.name;
                            return ownerName ? (
                              <span className="flex items-center gap-1.5 max-w-[140px]">
                                <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0", avatarColor(ownerName))}>
                                  {ownerName.trim()[0]?.toUpperCase() || "?"}
                                </span>
                                <span className="truncate text-slate-600 dark:text-slate-500 whitespace-nowrap">{ownerName}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            );
                          })()}
                        </td>
                      )}

                      {/* Created Date Column */}
                      {cols.created_at && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">
                          {formatDate(a.created_at)}
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
      {editingAccount && (
        <EditAccountModal open={true} onClose={() => setEditingAccount(null)} account={editingAccount} owners={owners} />
      )}
      <AddAccountsWizard open={showImportWizard} onClose={() => setShowImportWizard(false)} />

      {/* Row actions menu — kebab button in the rightmost column, Edit */}
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
                  <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer" />
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
            <button onClick={() => setSelected([])} className="rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-bold transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
