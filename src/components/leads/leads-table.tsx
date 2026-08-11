"use client";
import { useState, useTransition, useRef, useEffect, useOptimistic } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Filter, Plus, Trash2, ChevronDown, ChevronUp, Lock, Users2, Mail, Briefcase, User, UserCog, Clock, ArrowUpDown, ArrowUp, ArrowDown, Building2, Settings2, Phone, Globe, Calendar, Link2, CheckCircle2, XCircle, Tag, Share2, Layers3, X, Sparkles, Loader2, MoreVertical, Play, Megaphone, UserPlus, Check, Pencil, LayoutList, LayoutGrid, Download, RefreshCw, Upload, Star, FileText, FileSpreadsheet, Flame, type LucideIcon } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { industries as FALLBACK_INDUSTRIES, interestAreas as FALLBACK_INTEREST_AREAS } from "@/lib/mock-data";
import { getPicklistValues } from "@/lib/queries/picklists";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { AiColumnModal } from "@/components/leads/ai-column-modal";
import { EditLeadModal } from "@/components/leads/edit-lead-modal";
import { FindEmailPicker } from "@/components/leads/find-email-picker";
import { updateLead, type LeadRow } from "@/lib/queries/leads";
import { findAndSaveLeadCompany } from "@/lib/leads/find-company";
import { createStaticSegment } from "@/lib/queries/segments";
import { usePageTour } from "@/components/tour/use-page-tour";
import { LEADS_TOUR_STEPS } from "@/components/tour/tour-registry";
import { runAiColumn, deleteAiColumn, getAiColumnProgress, type AiColumnDefinitionRow, type AiColumnSavedTemplateRow } from "@/lib/queries/ai-columns";

// Customizable columns. Users toggle these via the gear menu in the header; the
// choice persists in localStorage so it survives reloads. `index`, the checkbox,
// and the delete/actions column are always shown and not part of this list logic.
type ColKey =
  | "index" | "name" | "company" | "email" | "status" | "score" | "source" | "owner" | "last_activity"
  | "industry" | "phone" | "interest_area" | "linkedin" | "website" | "verified" | "created_at";

interface ColumnDef { key: ColKey; label: string; icon?: LucideIcon; defaultOn: boolean }

// Default order/visibility follows the recommended layout:
// Row # | Lead | Company | Email | Status | AI Score | Source | Owner | Last Activity | Actions
//
// "index" (Row #) and "name" (Lead) are both frozen (sticky-left) alongside the
// checkbox column, and always render in that fixed order — Row # first, Lead
// second — regardless of the user's custom column order below, since their
// sticky-left pixel offsets assume that exact position. Every other column is
// freely reorderable via the Columns picker.
const FIRST_COLUMNS: ColumnDef[] = [
  { key: "index", label: "Row #", defaultOn: true },
  { key: "name", label: "Prospect", icon: User, defaultOn: true },
];
const REORDERABLE_COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company", icon: Building2, defaultOn: true },
  { key: "phone", label: "Phone", icon: Phone, defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "owner", label: "Owner", icon: UserCog, defaultOn: true },
  { key: "created_at", label: "Created Date", icon: Calendar, defaultOn: true },
  { key: "email", label: "Email", icon: Mail, defaultOn: false },
  { key: "score", label: "AI Score", icon: Sparkles, defaultOn: false },
  { key: "source", label: "Source", icon: Globe, defaultOn: false },
  { key: "last_activity", label: "Last Activity", icon: Clock, defaultOn: false },
  { key: "industry", label: "Industry", icon: Briefcase, defaultOn: false },
  { key: "interest_area", label: "Interest area", icon: Tag, defaultOn: false },
  { key: "linkedin", label: "LinkedIn", icon: Share2, defaultOn: false },
  { key: "website", label: "Website", icon: Link2, defaultOn: false },
  { key: "verified", label: "Verified", icon: CheckCircle2, defaultOn: false },
];
const COLUMNS: ColumnDef[] = [...FIRST_COLUMNS, ...REORDERABLE_COLUMNS];
const DEFAULT_ORDER: ColKey[] = REORDERABLE_COLUMNS.map((c) => c.key);

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_leads_columns";
const COLS_ORDER_STORAGE_KEY = "lp_leads_column_order";

interface Props {
  leads: LeadRow[];
  /** Powers the stat-card grid under the page header (matches the Campaigns page's layout). */
  stats?: { total: number; hot: number; scored: number; converted: number };
  /** When set, the list is scoped to one campaign's recipients (from "View report"). */
  campaignFilter?: { id: string; name: string };
  /** Pre-populate the search box (from global search). */
  initialSearch?: string;
  /** Saved Clay-style custom AI columns for this workspace, rendered after the built-in columns. */
  aiColumns?: AiColumnDefinitionRow[];
  /** Workspace's own saved AI column templates (user-created, distinct from the built-in library). */
  aiColumnSavedTemplates?: AiColumnSavedTemplateRow[];
  /** Maps owner_id -> full name, for the Owner column. */
  owners?: Record<string, string>;
}

/** Bold solid status pill — same real status vocabulary as before (plus the legacy
 *  Warm/Hot/Scored values, kept only so old data still renders a real color instead
 *  of a gray fallback), just restyled from an outline Badge to a filled pill. */
function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    New: "bg-blue-500 dark:bg-blue-600",
    Contacted: "bg-indigo-500 dark:bg-indigo-600",
    Qualified: "bg-teal-500 dark:bg-teal-600",
    Nurturing: "bg-amber-500 dark:bg-amber-600",
    Win: "bg-green-600 dark:bg-green-700",
    Converted: "bg-emerald-500 dark:bg-emerald-600",
    Warm: "bg-amber-500 dark:bg-amber-600",
    Hot: "bg-rose-500 dark:bg-rose-600",
    Scored: "bg-violet-500 dark:bg-violet-600",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap", styles[status] || "bg-slate-400 dark:bg-slate-600")}>
      {status}
    </span>
  );
}

/** Deterministic color per company/owner name, for the Company logo and Owner avatar chips. */
function logoColor(name?: string | null): string {
  const str = name || "";
  const palette = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

/** Small colored square "logo" for the Company column — first letter of the company name. */
function CompanyLogo({ name }: { name?: string | null }) {
  return (
    <span className={cn("h-6 w-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", logoColor(name))}>
      {name?.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}

export function LeadsTable({ leads, stats, campaignFilter, initialSearch, aiColumns = [], aiColumnSavedTemplates = [], owners = {} }: Props) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  usePageTour("leads", LEADS_TOUR_STEPS);
  const [pending, start] = useTransition();
  const [optimisticLeads, setOptimisticLeads] = useOptimistic(
    leads,
    (state, update: { id: string; is_favorite: boolean }) =>
      state.map((l) => (l.id === update.id ? { ...l, is_favorite: update.is_favorite } : l))
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [industryFilter, setIndustryFilter] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"list" | "grid">("list");

  const [industries, setIndustries] = useState(FALLBACK_INDUSTRIES);
  const [interestAreas, setInterestAreas] = useState(FALLBACK_INTEREST_AREAS);
  useEffect(() => {
    getPicklistValues("lead_industry").then(setIndustries).catch(() => {});
    getPicklistValues("lead_interest_area").then(setInterestAreas).catch(() => {});
  }, []);

  // Quick status/score filters — a row of pill shortcuts above the table.
  // "Needs Follow-up" is a chosen proxy (no dedicated field exists): a lead
  // that's been Contacted or is in Nurturing, i.e. worked but not yet resolved.
  type QuickFilter = "all" | "new" | "qualified" | "hot" | "followup";
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [cardFilter, setCardFilter] = useState<"all" | "hot" | "scored" | "converted">("all");
  const handleCardFilterChange = (newFilter: "all" | "hot" | "scored" | "converted") => {
    setCardFilter(newFilter);
    setPage(0);
  };

  // Missing-data quick actions — inline instead of a bare "—".
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [findEmailFor, setFindEmailFor] = useState<{ lead: LeadRow; top: number; left: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [findingCompanyId, setFindingCompanyId] = useState<string | null>(null);
  const [isBulkFindingCompany, setIsBulkFindingCompany] = useState(false);

  async function handleFindCompany(l: LeadRow) {
    if (!l.linkedin) {
      toast("Add a LinkedIn URL for this lead to find the company automatically.", "info");
      setEditingLead(l);
      return;
    }

    setFindingCompanyId(l.id);
    try {
      const res = await findAndSaveLeadCompany(l.id, l.linkedin, l.full_name);
      if (res.ok && res.companyName) {
        toast(`Saved company "${res.companyName}" for ${l.full_name || "lead"}.`, "success");
        start(() => {
          router.refresh();
        });
      } else {
        toast(res.error || "Could not find company name.", "error");
      }
    } catch {
      toast("Failed to connect to company finder service.", "error");
    } finally {
      setFindingCompanyId(null);
    }
  }

  async function handleBulkFindCompany() {
    const targetList = selected.length > 0
      ? optimisticLeads.filter((l) => selected.includes(l.id) && !l.company_name)
      : filtered.filter((l) => !l.company_name);

    if (!targetList.length) {
      toast(
        selected.length > 0
          ? "All selected leads already have a company name."
          : "No leads missing a company name.",
        "info"
      );
      return;
    }

    const leadsWithLinkedin = targetList.filter((l) => Boolean(l.linkedin));
    if (!leadsWithLinkedin.length) {
      toast("None of the targeted leads have a LinkedIn URL.", "error");
      return;
    }

    // Limit to max 10 leads per batch for ultra-fast execution
    const leadsToProcess = leadsWithLinkedin.slice(0, 10).map((l) => ({ id: l.id, linkedin: l.linkedin, full_name: l.full_name }));
    const hasMore = leadsWithLinkedin.length > 10;

    setIsBulkFindingCompany(true);
    toast(
      hasMore
        ? `Finding company names for 10 leads simultaneously...`
        : `Finding company names for ${leadsToProcess.length} lead(s) simultaneously...`,
      "info"
    );

    try {
      const response = await fetch("/api/leads/find-companies-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: leadsToProcess }),
      });
      const data = await response.json();

      if (data.ok && data.successCount > 0) {
        toast(
          hasMore
            ? `Finished! Updated ${data.successCount} company name(s). Click Play again for remaining leads.`
            : `Finished! Successfully updated ${data.successCount} company name(s).`,
          "success"
        );
        start(() => {
          router.refresh();
        });
      } else {
        toast(data.error || "Could not find company names for the targeted leads.", "error");
      }
    } catch {
      toast("Failed to connect to bulk company finder API.", "error");
    } finally {
      setIsBulkFindingCompany(false);
    }
  }

  // Selection contextual bar — replaces the toolbar controls while rows are selected.
  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [segmentType, setSegmentType] = useState<"static" | "dynamic">("static");

  // Clicking a lead navigates to its own full page (/leads/[id]) — matches how
  // campaign-detail-view.tsx gives each campaign a real standalone page instead
  // of an overlay on the list.
  function openLead(id: string) {
    router.push(`/leads/${id}`);
  }
  // Per-column header sort — click any column's arrow to sort by it, click again
  // to flip direction. The "Sort By" toolbar dropdown is just a few named presets
  // over this same state, so both controls always stay in sync.
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleColumnSort(key: ColKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);

  // Per-column header search (click a header to filter by that column's value).
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [filterPopover, setFilterPopover] = useState<{ key: ColKey; top: number; left: number } | null>(null);
  const [filterDraft, setFilterDraft] = useState("");

  // Industry/interest filters — opened as a popover next to the count chip.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState<{ top: number; left: number } | null>(null);
  const hasActiveFilters = Boolean(industryFilter || interestFilter || quickFilter !== "all");
  function openFiltersPopover(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setFiltersPos({ top: r.bottom + 6, left: r.left });
    setFiltersOpen(true);
  }

  // "Added between" date-range filter — its own dedicated toolbar button/popover.
  const [datesOpen, setDatesOpen] = useState(false);
  const [datesPos, setDatesPos] = useState<{ top: number; left: number } | null>(null);
  const hasActiveDateFilter = Boolean(dateFrom || dateTo);
  function openDatesPopover(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setDatesPos({ top: r.bottom + 6, left: r.left });
    setDatesOpen(true);
  }
  function dateRangeLabel(): string {
    // Append a local-midnight time so formatDate's `new Date(...)` parses this
    // as local time, not UTC — a bare "YYYY-MM-DD" parses as UTC midnight and
    // renders a day early for anyone west of UTC (matches the T00:00:00 pattern
    // already used for dateFrom/dateTo filtering above).
    if (dateFrom && dateTo) return `${formatDate(`${dateFrom}T00:00:00`)} – ${formatDate(`${dateTo}T00:00:00`)}`;
    if (dateFrom) return `From ${formatDate(`${dateFrom}T00:00:00`)}`;
    if (dateTo) return `Until ${formatDate(`${dateTo}T00:00:00`)}`;
    return "All dates";
  }

  // Column visibility (persisted). Hydrate from localStorage after mount to avoid SSR mismatch.
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);
  // Custom order for the reorderable columns (everything after the fixed Row #/Lead pair).
  const [colOrder, setColOrder] = useState<ColKey[]>(DEFAULT_ORDER);

  // Hydrate saved column choices/order after mount (localStorage is client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCols({ ...DEFAULT_COLS, ...JSON.parse(raw) });
    } catch { /* ignore malformed storage */ }
    try {
      const rawOrder = localStorage.getItem(COLS_ORDER_STORAGE_KEY);
      if (rawOrder) {
        const saved = JSON.parse(rawOrder) as ColKey[];
        // Merge with the current default order so a newly-added column key
        // (e.g. shipped after a user already saved a custom order) still shows up.
        const merged = [...saved.filter((k) => DEFAULT_ORDER.includes(k)), ...DEFAULT_ORDER.filter((k) => !saved.includes(k))];
        setColOrder(merged);
      }
    } catch { /* ignore malformed storage */ }
  }, []);

  function toggleCol(k: ColKey) {
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function resetCols() {
    setCols(DEFAULT_COLS);
    setColOrder(DEFAULT_ORDER);
    try {
      localStorage.removeItem(COLS_STORAGE_KEY);
      localStorage.removeItem(COLS_ORDER_STORAGE_KEY);
    } catch { /* ignore */ }
  }
  function openColsMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setColsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setShowCols(true);
  }

  /** Moves a reorderable column up/down in the custom order — Row # and Lead are never part of this list. */
  function moveCol(k: ColKey, direction: -1 | 1) {
    setColOrder((order) => {
      const i = order.indexOf(k);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= order.length) return order;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      try { localStorage.setItem(COLS_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const columnByKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const visibleCols = [
    ...FIRST_COLUMNS.filter((c) => cols[c.key]),
    ...colOrder.filter((k) => cols[k]).map((k) => columnByKey.get(k)!),
  ];

  // Clay-style custom AI columns — creation/run/delete + per-row single-cell generation.
  const [showAiColumnModal, setShowAiColumnModal] = useState(false);
  const [aiColMenu, setAiColMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [runningColumnId, setRunningColumnId] = useState<string | null>(null);
  const [runningCellKey, setRunningCellKey] = useState<string | null>(null);
  // Live progress while a "Run on all leads" bulk job is in flight — polled from the
  // server since runAiColumn itself is one long request with no incremental callback.
  const [runProgress, setRunProgress] = useState<{ columnId: string; done: number; total: number } | null>(null);

  function openAiColMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const r = e.currentTarget.getBoundingClientRect();
    setAiColMenu({ id, top: r.bottom + 6, left: r.left });
  }

  function runAiColumnOnAll(columnId: string) {
    setAiColMenu(null);
    setRunningColumnId(columnId);
    setRunProgress({ columnId, done: 0, total: optimisticLeads.length });

    const poll = setInterval(async () => {
      const p = await getAiColumnProgress(columnId);
      setRunProgress({ columnId, ...p });
    }, 1200);

    start(async () => {
      await runAiColumn(columnId);
      clearInterval(poll);
      setRunningColumnId(null);
      setRunProgress(null);
      router.refresh();
    });
  }

  async function handleDeleteAiColumn(columnId: string) {
    setAiColMenu(null);
    if (!(await confirm({ title: "Delete AI column?", message: "This removes the column and its generated values for every lead.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteAiColumn(columnId);
      router.refresh();
    });
  }

  function runAiColumnOnRow(columnId: string, leadId: string) {
    const key = `${columnId}:${leadId}`;
    setRunningCellKey(key);
    start(async () => {
      await runAiColumn(columnId, [leadId]);
      setRunningCellKey(null);
      router.refresh();
    });
  }

  const activeColumnFilterKeys = (Object.keys(columnFilters) as ColKey[]).filter((k) => columnFilters[k]);

  const baseFiltered = optimisticLeads.filter((l) => {
    const name = l.full_name || l.company_name || "";
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      name.toLowerCase().includes(q) ||
      (l.company_name?.toLowerCase().includes(q) ?? false) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      (l.website_url?.toLowerCase().includes(q) ?? false);
    const matchIndustry = !industryFilter || l.industry === industryFilter;
    const matchInterest = !interestFilter || l.interest_area === interestFilter;

    // Compare by local calendar day (not exact instant) so "From X to Y" matches
    // what the user actually sees in the Created Date column, regardless of the
    // time-of-day a record was created — a UTC timestamp late in the day can
    // otherwise fall on a different local calendar day than its displayed date.
    const createdDay = toLocalDayKey(new Date(l.created_at));
    const matchDateFrom = !dateFrom || createdDay >= dateFrom;
    const matchDateTo = !dateTo || createdDay <= dateTo;

    const matchColumns = activeColumnFilterKeys.every((k) => {
      const raw = columnFilters[k] || "";
      if (k === "created_at") {
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) return createdDay === toLocalDayKey(parsed);
      }
      return getColumnText(k, l).toLowerCase().includes(raw.toLowerCase());
    });

    return matchSearch && matchIndustry && matchInterest && matchDateFrom && matchDateTo && matchColumns;
  });

  function matchesQuickFilter(l: LeadRow, f: QuickFilter): boolean {
    switch (f) {
      case "new": return l.status === "New";
      case "qualified": return l.status === "Qualified";
      case "hot": return scoreLevel(l.lead_score).label === "Hot";
      case "followup": return l.status === "Contacted" || l.status === "Nurturing";
      default: return true;
    }
  }

  const quickFilterCounts: Record<QuickFilter, number> = {
    all: baseFiltered.length,
    new: baseFiltered.filter((l) => matchesQuickFilter(l, "new")).length,
    qualified: baseFiltered.filter((l) => matchesQuickFilter(l, "qualified")).length,
    hot: baseFiltered.filter((l) => matchesQuickFilter(l, "hot")).length,
    followup: baseFiltered.filter((l) => matchesQuickFilter(l, "followup")).length,
  };

  const filtered = baseFiltered
    .filter((l) => matchesQuickFilter(l, quickFilter))
    .filter((l) => {
      if (cardFilter === "hot") return l.status === "Hot";
      if (cardFilter === "scored") return l.lead_score > 0;
      if (cardFilter === "converted") return l.status === "Converted";
      return true;
    });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    // Date columns must compare actual timestamps — their displayed text (e.g.
    // "Jul 30, 2026") sorts alphabetically by month name under localeCompare,
    // not chronologically, which is why "Newest" previously did nothing sane.
    if (sortKey === "created_at" || sortKey === "last_activity") {
      const av = sortKey === "created_at" ? a.created_at : a.updated_at;
      const bv = sortKey === "created_at" ? b.created_at : b.updated_at;
      const cmp = new Date(av).getTime() - new Date(bv).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    }
    // Every other column reuses the same plain-text-per-column logic the header
    // search filter already relies on (getColumnText), so it sorts on exactly
    // what it displays — no separate comparator to keep in sync per column.
    const cmp = getColumnText(sortKey, a).localeCompare(getColumnText(sortKey, b), undefined, { numeric: true, sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function displayName(l: LeadRow): string {
    return l.full_name || l.company_name || "—";
  }

  const AVATAR_COLORS = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600"];

  /** First letter of the first and last word — "?" for an unnamed lead. */
  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length || name === "—") return "?";
    const first = parts[0][0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase() || "?";
  }

  /** Deterministic color per name so the same lead always gets the same avatar color. */
  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  /** AI Score band — e.g. 82 → Hot, 65 → Warm, 32 → Cold. */
  function scoreLevel(score: number): { label: "Hot" | "Warm" | "Cold"; textClass: string; dotClass: string } {
    if (score >= 70) return { label: "Hot", textClass: "text-rose-600 dark:text-rose-400", dotClass: "bg-rose-500" };
    if (score >= 40) return { label: "Warm", textClass: "text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" };
    return { label: "Cold", textClass: "text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" };
  }

  /** Clay-style compact status badge for AI column results — booleans and AnySite email
   *  lookups render as an icon + short label instead of raw text, which also reads
   *  better in a narrow column when the table is squeezed (e.g. AI Assistant open). */
  function renderAiColumnCellValue(col: AiColumnDefinitionRow, value: string) {
    if (col.action_type === "anysite_email") {
      const isEmail = /\S+@\S+\.\S+/.test(value);
      return isEmail ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 max-w-full">
          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{value}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 max-w-full">
          <XCircle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{value || "Not found"}</span>
        </span>
      );
    }
    if (col.output_type === "boolean") {
      const isYes = /^\s*(yes|true)\b/i.test(value);
      return isYes ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
          <XCircle className="h-3 w-3" /> No
        </span>
      );
    }
    return <span className="block max-w-[260px] truncate text-slate-700" title={value}>{value || "—"}</span>;
  }

  /** Plain-text value of a column, for the header click-to-search filter. */
  // Local (browser) calendar-day key, e.g. "2026-07-30" — matches the day
  // rendered by formatDate/formatDateTime and the value <input type="date"> gives.
  function toLocalDayKey(d: Date): string {
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getColumnText(key: ColKey, l: LeadRow): string {
    switch (key) {
      case "name": return displayName(l);
      case "company": return l.company_name || "";
      case "email": return l.email || "";
      case "status": return l.status || "";
      case "score": return `${l.lead_score ?? ""} ${scoreLevel(l.lead_score ?? 0).label}`;
      case "source": return l.source || "";
      case "owner": return (l.owner_id && owners[l.owner_id]) || "";
      case "last_activity": return formatDate(l.updated_at);
      case "industry": return l.industry || "";
      case "phone": return l.phone || "";
      case "interest_area": return l.interest_area || "";
      case "linkedin": return l.linkedin || "";
      case "website": return l.website_url || "";
      case "verified": return l.verified ? "Verified" : "No";
      case "created_at": return formatDateTime(l.created_at);
      default: return "";
    }
  }

  function openColumnFilter(e: React.MouseEvent<HTMLElement>, key: ColKey) {
    if (key === "index") return;
    const r = e.currentTarget.getBoundingClientRect();
    setFilterDraft(columnFilters[key] || "");
    setFilterPopover({ key, top: r.bottom + 6, left: r.left });
  }
  function applyColumnFilter() {
    if (!filterPopover) return;
    const key = filterPopover.key;
    setColumnFilters((f) => {
      const next = { ...f };
      if (filterDraft.trim()) next[key] = filterDraft.trim();
      else delete next[key];
      return next;
    });
    setFilterPopover(null);
  }
  function clearColumnFilter(key: ColKey, e?: React.MouseEvent) {
    e?.stopPropagation();
    setColumnFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map((l) => l.id));

  const selectedLeads = optimisticLeads.filter((l) => selected.includes(l.id));
  const selectedWithEmail = selectedLeads.filter((l) => l.email).length;
  const selectedMissingEmail = selectedLeads.length - selectedWithEmail;

  /** Plain-text rows for export (Name/Email/Company/Phone/Status/Owner/Created), scoped to
   *  the currently filtered/searched leads, not just the current page. Shared by both export formats. */
  function exportRows(): { header: string[]; rows: string[][] } {
    const header = ["Name", "Email", "Company", "Phone", "Status", "Owner", "Created"];
    const rows = filtered.map((l) => [
      displayName(l),
      l.email || "",
      l.company_name || "",
      l.phone || "",
      l.status || "",
      (l.owner_id && owners[l.owner_id]) || "",
      formatDateTime(l.created_at),
    ]);
    return { header, rows };
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function downloadBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** No xlsx library needed — Excel opens a plain HTML <table> saved with a .xls
   *  extension natively, same trick used by many lightweight "export to Excel" features. */
  function handleExportExcel() {
    setShowExportMenu(false);
    const { header, rows } = exportRows();
    const table = `<table><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("")}</table>`;
    const html = `<html><head><meta charset="utf-8" /></head><body>${table}</body></html>`;
    downloadBlob(html, "application/vnd.ms-excel", `leads-${new Date().toISOString().slice(0, 10)}.xls`);
  }

  /** No PDF library needed — opens a print-formatted window and triggers the browser's
   *  native print dialog, where "Save as PDF" produces the file. */
  function handleExportPdf() {
    setShowExportMenu(false);
    const { header, rows } = exportRows();
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Prospects</title><style>
      body { font-family: sans-serif; padding: 24px; color: #0f172a; }
      h1 { font-size: 18px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; }
    </style></head><body>
      <h1>Prospects (${rows.length})</h1>
      <table><thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function openSegmentDialog() {
    setSegmentName("");
    setSegmentDescription("");
    setSegmentType("static");
    setSegmentDialogOpen(true);
  }

  async function handleCreateSegment() {
    const name = segmentName.trim();
    if (!name) return;
    const ids = [...selected];
    setSegmentDialogOpen(false);
    setSelected([]);
    start(async () => {
      await createStaticSegment(name, segmentDescription.trim(), ids);
      toast(`Segment "${name}" created with ${ids.length} lead${ids.length === 1 ? "" : "s"}.`, "success");
    });
  }

  /** Bulk "Add to Campaign" has no notion of an ad-hoc lead-ID audience in the
   *  campaign builder today — it only accepts "All leads" or a Segment. So this
   *  quietly creates a Static segment from the selection first, then hands off
   *  to the builder with that segment pre-selected. */
  async function handleAddToCampaign() {
    const ids = [...selected];
    const count = ids.length;
    setSelected([]);
    start(async () => {
      const seg = await createStaticSegment(`Campaign audience (${count} leads)`, "", ids);
      router.push(`/campaigns/builder?segment=${seg.id}`);
    });
  }

  function handleAssignOwner(ownerId: string) {
    setShowOwnerMenu(false);
    const ids = [...selected];
    const ownerName = owners[ownerId] || "owner";
    setSelected([]);
    start(async () => {
      await Promise.allSettled(ids.map((id) => updateLead(id, { owner_id: ownerId })));
      toast(`${ids.length} lead${ids.length === 1 ? "" : "s"} assigned to ${ownerName}.`, "success");
      router.refresh();
    });
  }

  function toggleFavorite(lead: LeadRow) {
    const nextFavorite = !lead.is_favorite;
    start(async () => {
      setOptimisticLeads({ id: lead.id, is_favorite: nextFavorite });
      try {
        await updateLead(lead.id, { is_favorite: nextFavorite });
        router.refresh();
      } catch (err) {
        toast("Failed to update favorite status", "error");
      }
    });
  }

  function renderCell(key: ColKey, l: LeadRow, rowNumber: number) {
    switch (key) {
      case "index":
        return <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono text-xs">{rowNumber}</span>;
      case "name": {
        const name = displayName(l);
        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFavorite(l); }}
              title={l.is_favorite ? "Remove from favorites" : "Add to favorites"}
              className="p-0.5 rounded flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Star className={cn("h-4 w-4", l.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600")} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openLead(l.id); }}
              className="flex items-center gap-2 max-w-[220px] text-left group"
            >
              <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", avatarColor(name))}>
                {initials(name)}
              </span>
              <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate whitespace-nowrap">
                {name}
              </span>
            </button>
          </div>
        );
      }
      case "company": {
        if (l.company_name) {
          return (
            <span className="flex items-center gap-1.5 max-w-[180px]">
              <CompanyLogo name={l.company_name} />
              <span className="truncate text-slate-700 dark:text-slate-600 whitespace-nowrap" title={l.company_name || undefined}>{l.company_name}</span>
            </span>
          );
        }
        const isFindingCompany = findingCompanyId === l.id;
        return (
          <button
            type="button"
            disabled={isFindingCompany}
            onClick={(e) => {
              e.stopPropagation();
              handleFindCompany(l);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap disabled:opacity-75"
          >
            {isFindingCompany ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" /> Finding...
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" /> Add company
              </>
            )}
          </button>
        );
      }
      case "email":
        return l.email ? (
          <span className="block max-w-[240px] truncate text-slate-600 dark:text-slate-600 whitespace-nowrap" title={l.email}>{l.email}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setFindEmailFor({ lead: l, top: r.bottom + 6, left: r.left });
            }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Mail className="h-3 w-3" /> Find email
          </button>
        );
      case "industry":
        return l.industry ? (
          <span className="block max-w-[160px] truncate text-slate-600 dark:text-slate-500 whitespace-nowrap" title={l.industry}>{l.industry}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAiColumnModal(true); }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Sparkles className="h-3 w-3" /> Enrich with AI
          </button>
        );
      case "score": {
        const level = scoreLevel(l.lead_score);
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`Score: ${l.lead_score}`}>
            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", level.dotClass)} />
            <span className={cn("text-xs font-bold", level.textClass)}>
              {level.label}
            </span>
          </span>
        );
      }
      case "status":
        return <StatusPill status={l.status} />;
      case "phone":
        return l.phone ? (
          <span className="text-slate-600 dark:text-slate-500 font-mono text-xs whitespace-nowrap">{l.phone}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingLead(l); }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" /> Add phone
          </button>
        );
      case "interest_area":
        return <span className="text-slate-600 dark:text-slate-500 truncate max-w-[140px] block whitespace-nowrap">{l.interest_area || "—"}</span>;
      case "source":
        return <span className="text-slate-600 dark:text-slate-500 truncate max-w-[140px] block whitespace-nowrap">{l.source || "—"}</span>;
      case "owner": {
        const ownerName = l.owner_id ? owners[l.owner_id] : undefined;
        return ownerName ? (
          <span className="flex items-center gap-1.5 max-w-[140px]">
            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0", logoColor(ownerName))}>
              {ownerName.trim()[0]?.toUpperCase() || "?"}
            </span>
            <span className="truncate text-slate-600 dark:text-slate-500 whitespace-nowrap">{ownerName}</span>
          </span>
        ) : (
          <span className="text-slate-600 dark:text-slate-500 truncate max-w-[140px] block whitespace-nowrap"><span className="text-slate-400">Unassigned</span></span>
        );
      }
      case "last_activity":
        return <span className="text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">{formatDate(l.updated_at)}</span>;
      case "linkedin":
        return l.linkedin ? (
          <a href={l.linkedin} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs whitespace-nowrap"><Share2 className="h-3.5 w-3.5" /> Profile</a>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingLead(l); }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" /> Add LinkedIn
          </button>
        );
      case "website":
        return l.website_url ? (
          <a href={l.website_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 max-w-[180px] truncate text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs whitespace-nowrap"><Link2 className="h-3.5 w-3.5 flex-shrink-0" />{l.website_url.replace(/^https?:\/\//, "")}</a>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingLead(l); }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" /> Add website
          </button>
        );
      case "verified":
        return l.verified
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
          : <span className="text-xs text-slate-400 whitespace-nowrap">No</span>;
      case "created_at":
        return <span className="text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">{formatDateTime(l.created_at)}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-4">
    <div className={showAiColumnModal ? "flex-1 min-w-0" : "max-w-[1600px] mx-auto w-full"}>
      {/* Page header — title + total count badge, breadcrumb, Export/Refresh/Import actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 data-tour-id="leads-title" className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Prospects
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            <Link href="/dashboard" className="hover:text-slate-700 dark:hover:text-slate-600">Home</Link>
            <span className="mx-1">›</span>
            <span className="text-slate-700 dark:text-slate-600 font-medium">Prospects</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <Button size="sm" onClick={() => setShowExportMenu((v) => !v)} className="rounded-xl gap-1.5 font-semibold h-8 text-xs px-3">
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </Button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1">
                  <button onClick={handleExportPdf} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                    <FileText className="h-3.5 w-3.5 text-slate-400" /> Export as PDF
                  </button>
                  <button onClick={handleExportExcel} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" /> Export as Excel
                  </button>
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => {
            toast("Refreshing prospects...", "info");
            router.refresh();
            setTimeout(() => window.location.reload(), 100);
          }} title="Refresh" className="rounded-xl h-8 w-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowWizard(true)} title="Import prospects" className="rounded-xl h-8 w-8">
            <Upload className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {stats && (
        <div data-tour-id="leads-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total prospects", value: stats.total, icon: Users2, accent: "bg-amber-500", key: "all", ring: "ring-amber-500", bg: "bg-amber-500/[0.04] dark:bg-amber-500/[0.08]" },
            { label: "Hot prospects", value: stats.hot, icon: Flame, accent: "bg-rose-500", key: "hot", ring: "ring-rose-500", bg: "bg-rose-500/[0.04] dark:bg-rose-500/[0.08]" },
            { label: "AI scored", value: stats.scored, icon: Sparkles, accent: "bg-blue-500", key: "scored", ring: "ring-blue-500", bg: "bg-blue-500/[0.04] dark:bg-blue-500/[0.08]" },
            { label: "Converted", value: stats.converted, icon: CheckCircle2, accent: "bg-emerald-500", key: "converted", ring: "ring-emerald-500", bg: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]" },
          ].map((s) => {
            const Icon = s.icon;
            const active = cardFilter === s.key;
            return (
              <Card
                key={s.label}
                onClick={() => handleCardFilterChange(s.key as any)}
                className={cn(
                  "p-4 sm:p-5 flex items-center gap-3 cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-xs",
                  active
                    ? `ring-2 ${s.ring} ${s.bg} border-transparent shadow-xs`
                    : "bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800"
                )}
              >
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
      )}

      {campaignFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <p className="text-sm text-blue-900">
            Showing <span className="font-semibold">{optimisticLeads.length}</span> lead{optimisticLeads.length === 1 ? "" : "s"} in campaign <span className="font-semibold">{campaignFilter.name}</span>
            <span className="text-blue-700/70"> · click a lead to see its email stages</span>
          </p>
          <Link href="/leads" className="text-sm font-medium text-blue-700 hover:text-blue-900">Clear filter ✕</Link>
        </div>
      )}
      <Card className="overflow-hidden">
        {/* Toolbar Row 1: Search & Actions */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left Side: Search Input */}
          <div className="w-full md:w-auto flex-grow max-w-sm">
            <Input
              leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
              rightIcon={
                search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="pointer-events-auto p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-[var(--muted)] hover:text-slate-600 dark:hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : undefined
              }
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs rounded-xl"
            />
          </div>

          {/* Right Side Actions: Manage Columns, AI Actions, View Toggle, Add Prospect */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Columns Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openColsMenu}
              className="rounded-xl gap-1 font-semibold h-8 text-xs px-2.5 flex-shrink-0 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
              title="Customize visible columns"
            >
              <Settings2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Manage Columns</span>
            </Button>

            {/* Use AI Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAiColumnModal(true)}
              className="rounded-xl gap-1 font-semibold h-8 text-xs px-2.5 border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex-shrink-0"
              title="AI-powered column enrichment"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <span>AI Actions</span>
            </Button>

            {/* List/Grid View Toggle */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex-shrink-0">
              <button type="button" onClick={() => setView("list")} className={cn("h-8 w-8 flex items-center justify-center transition-colors", view === "list" ? "bg-[var(--primary)] text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")} title="List view"><LayoutList className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setView("grid")} className={cn("h-8 w-8 flex items-center justify-center transition-colors border-l border-slate-200 dark:border-slate-800", view === "grid" ? "bg-[var(--primary)] text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")} title="Grid view"><LayoutGrid className="h-3.5 w-3.5" /></button>
            </div>

            {/* Add Lead */}
            <Button
              data-tour-id="leads-add-prospect"
              size="sm"
              onClick={() => setShowWizard(true)}
              className="rounded-xl gap-1.5 font-bold h-8 px-3 text-xs flex-shrink-0 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Prospect</span>
            </Button>
          </div>
        </div>

        {/* Toolbar Row 2: Filters & Controls */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 overflow-x-auto scrollbar-hide bg-slate-50/30 dark:bg-slate-900/10">
          {/* Count Chip */}
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 flex-shrink-0 whitespace-nowrap">
            <Users2 className="h-3.5 w-3.5 text-slate-400" />
            <span>
              {filtered.length}{" "}
              {cardFilter === "hot"
                ? "Hot Prospect"
                : cardFilter === "scored"
                ? "AI Scored Prospect"
                : cardFilter === "converted"
                ? "Converted Prospect"
                : "Prospect"}
              {filtered.length === 1 ? "" : "s"}
            </span>
            {cardFilter !== "all" && (
              <button
                onClick={() => handleCardFilterChange("all")}
                title="Clear filter"
                className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Date Range Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={openDatesPopover}
            className={cn(
              "rounded-xl gap-1 font-medium h-8 text-xs px-2.5 flex-shrink-0",
              hasActiveDateFilter && "ring-1 ring-blue-500/30 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
            )}
            title="Filter by date added"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{dateRangeLabel()}</span>
          </Button>

          {/* Filter Button */}
          <Button
            data-tour-id="leads-filter"
            variant="outline"
            size="sm"
            onClick={openFiltersPopover}
            className={cn(
              "rounded-xl gap-1 font-medium h-8 text-xs px-2.5 flex-shrink-0",
              hasActiveFilters && "ring-1 ring-blue-500/30 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
            )}
            title="Filter prospects"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filter</span>
            <ChevronDown className="h-3 w-3" />
            {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
          </Button>

          {/* Sort Dropdown */}
          <div className="relative inline-flex items-center gap-1 flex-shrink-0 w-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-8 pl-2.5 pr-1.5 shadow-sm">
            <ArrowUpDown className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-600 flex-shrink-0 whitespace-nowrap">Sort By</span>
            <select
              value={
                !sortKey ? "none"
                : sortKey === "name" && sortDir === "asc" ? "name"
                : sortKey === "score" && sortDir === "desc" ? "score"
                : sortKey === "created_at" && sortDir === "desc" ? "newest"
                : "none"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") { setSortKey(null); setSortDir("asc"); }
                else if (v === "name") { setSortKey("name"); setSortDir("asc"); }
                else if (v === "score") { setSortKey("score"); setSortDir("desc"); }
                else if (v === "newest") { setSortKey("created_at"); setSortDir("desc"); }
              }}
              className="appearance-none bg-transparent border-0 pl-1 pr-4 py-1 text-xs font-semibold text-slate-700 dark:text-slate-600 focus:outline-none cursor-pointer truncate"
            >
              <option value="none">Default</option>
              <option value="name">Name A–Z</option>
              <option value="score">Score High→Low</option>
              <option value="newest">Newest</option>
            </select>
            <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 pointer-events-none" />
          </div>
        </div>

        {/* Table Container */}
        {view === "list" && (
        <div className="relative">
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
            {/* border-separate (not border-collapse) — collapse renders duplicated/
                dashed hairline artifacts at sticky (frozen) column boundaries in
                Chrome/Safari when combined with position:sticky cells. */}
            <table className="w-full text-sm border-separate border-spacing-0 min-w-[900px]">
              <thead className="bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-20 backdrop-blur-md">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  <th
                    className="sticky left-0 z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md px-3 py-2.5"
                    style={{ width: 40, minWidth: 40, maxWidth: 40 }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                    />
                  </th>
                  {visibleCols.map((c) => {
                    const filterable = c.key !== "index";
                    const sortable = c.key !== "index";
                    const active = Boolean(columnFilters[c.key]);
                    const isSorted = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          "px-3 py-2.5 font-bold whitespace-nowrap",
                          c.key === "index" && "sticky left-10 z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md",
                          c.key === "name" && "sticky left-[88px] z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md"
                        )}
                        // Sticky offsets below (left-10, left-[88px]) are hardcoded pixel
                        // sums of the checkbox + Row# column widths — fix both header AND
                        // body cell widths for these two columns (inline style, not just a
                        // Tailwind class) so auto table-layout can never resolve a different
                        // actual width than the offsets assume. Without this, extra visible
                        // columns / longer content could widen these columns and misalign
                        // every sticky column to their right during horizontal scroll.
                        style={c.key === "index" ? { width: 48, minWidth: 48, maxWidth: 48 } : undefined}
                      >
                        <span
                          role={filterable ? "button" : undefined}
                          title={filterable ? `Click to search ${c.label}` : undefined}
                          onClick={filterable ? (e) => openColumnFilter(e, c.key) : undefined}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1 transition-colors",
                            filterable && "cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800",
                            active && "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60"
                          )}
                        >
                          {c.icon && <c.icon className={cn("h-3.5 w-3.5", active ? "text-blue-500" : "text-slate-400")} />}
                          {c.label === "Row #" ? "#" : c.label}
                          {sortable && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleColumnSort(c.key); }}
                              title={`Sort by ${c.label}`}
                              className={cn("p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700", isSorted && "text-blue-600 dark:text-blue-400")}
                            >
                              {isSorted ? (
                                sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-400" />
                              )}
                            </button>
                          )}
                          {c.key === "company" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBulkFindCompany();
                              }}
                              disabled={isBulkFindingCompany}
                              title={
                                selected.length > 0
                                  ? `Run company search for ${selected.length} selected lead(s)`
                                  : "Run company search for all leads missing a company name"
                              }
                              className="ml-1 inline-flex items-center justify-center p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-transform active:scale-95 disabled:opacity-50"
                            >
                              {isBulkFindingCompany ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                              ) : (
                                <Play className="h-3.5 w-3.5 fill-current text-blue-600 dark:text-blue-400 hover:scale-110" />
                              )}
                            </button>
                          )}
                          {active && (
                            <span
                              role="button"
                              title="Clear filter"
                              onClick={(e) => clearColumnFilter(c.key, e)}
                              className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {aiColumns.map((col) => {
                    const running = runProgress?.columnId === col.id;
                    const pct = running && runProgress.total > 0 ? Math.round((runProgress.done / runProgress.total) * 100) : 0;
                    return (
                      <th key={col.id} className="px-3 py-2.5 font-bold w-[200px] max-w-[200px] whitespace-nowrap">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <span className="truncate" title={col.name}>{col.name}</span>
                          <button
                            onClick={(e) => openAiColMenu(e, col.id)}
                            title="Column actions"
                            className="p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 flex-shrink-0 ml-auto"
                          >
                            <MoreVertical className="h-3 w-3 text-slate-400" />
                          </button>
                        </span>
                        {running && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <div className="flex-1 h-[3px] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full bg-blue-500 transition-[width] duration-500 rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                            </div>
                            <span className="text-[10px] font-normal normal-case text-slate-400 tabular-nums flex-shrink-0">{pct}%</span>
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-3 py-2.5 w-16 text-right font-bold whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + aiColumns.length + 2} className="px-4 py-16 text-center text-slate-500">
                      No prospects yet. Click <strong>Add Prospect</strong> to import from LinkedIn, social, or a CSV.
                    </td>
                  </tr>
                )}
                {paged.map((l, i) => (
                  <tr
                    key={l.id}
                    onClick={() => openLead(l.id)}
                    className="group hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td
                      className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors px-3 py-2"
                      style={{ width: 40, minWidth: 40, maxWidth: 40 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(l.id)}
                        onChange={() => toggle(l.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                      />
                    </td>
                    {visibleCols.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2",
                          c.key === "index" && "sticky left-10 z-10 bg-white group-hover:bg-slate-50 transition-colors",
                          c.key === "name" && "sticky left-[88px] z-10 bg-white group-hover:bg-slate-50 transition-colors"
                        )}
                        style={c.key === "index" ? { width: 48, minWidth: 48, maxWidth: 48 } : undefined}
                        onClick={c.key === "linkedin" || c.key === "website" ? (e) => e.stopPropagation() : undefined}
                      >
                        {renderCell(c.key, l, safePage * pageSize + i + 1)}
                      </td>
                    ))}
                    {aiColumns.map((col) => {
                      const cellKey = `${col.id}:${l.id}`;
                      const computed = l.custom_fields?.[col.id];
                      const running = runningCellKey === cellKey || runningColumnId === col.id;
                      return (
                        <td key={col.id} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {running ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                          ) : computed ? (
                            renderAiColumnCellValue(col, computed.value)
                          ) : (
                            <button
                              onClick={() => runAiColumnOnRow(col.id, l.id)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              <Play className="h-3 w-3" /> Generate
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setRowMenu({ id: l.id, top: r.bottom + 4, left: Math.max(8, r.right - 140) }); }}
                        title="Row actions"
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                      >
                        <MoreVertical className="h-4 w-4 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Grid/card view — a simpler secondary view over the same filtered/sorted/paged leads;
            intentionally skips sticky columns, missing-data quick actions, AI columns, and
            bulk-select, which stay list-view-only. */}
        {view === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3 sm:p-4">
            {paged.map((l) => (
              <div key={l.id} onClick={() => openLead(l.id)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={cn("h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0", avatarColor(displayName(l)))}>
                    {initials(displayName(l))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">{displayName(l)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{l.company_name || "—"}</p>
                  </div>
                  <StatusPill status={l.status} />
                </div>
                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-500">
                  <p>{l.email || "—"}</p>
                  <p>{l.phone || "—"}</p>
                  <p>{formatDateTime(l.created_at)}</p>
                </div>
              </div>
            ))}
            {paged.length === 0 && (
              <p className="col-span-full text-center text-slate-500 dark:text-slate-500 py-16">No prospects yet. Click <strong>Add Prospect</strong> to import from LinkedIn, social, or a CSV.</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-500">
          <div className="flex items-center gap-1.5 text-xs">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-90" />
            </button>
            {(() => {
              // 1-indexed page numbers, windowed around the current page with "…" gaps —
              // always keeps the first/last page visible so long lists (e.g. 125 leads =
              // 13 pages at 10/page) don't render a button per page.
              const current = safePage + 1;
              const around = 1;
              const nums: number[] = [];
              for (let i = 1; i <= pageCount; i++) {
                if (i === 1 || i === pageCount || (i >= current - around && i <= current + around)) nums.push(i);
              }
              const withDots: (number | "…")[] = [];
              let prev: number | undefined;
              for (const n of nums) {
                if (prev !== undefined && n - prev > 1) withDots.push("…");
                withDots.push(n);
                prev = n;
              }
              return withDots.map((n, i) =>
                n === "…" ? (
                  <span key={`dots-${i}`} className="px-1 text-xs text-slate-400">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n - 1)}
                    className={cn(
                      "h-7 min-w-7 px-2 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                      n === current
                        ? "bg-red-600 text-white"
                        : "text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    {n}
                  </button>
                )
              );
            })()}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
            >
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </div>
        </div>
      </Card>

      <AddLeadsWizard open={showWizard} onClose={() => setShowWizard(false)} />

      {editingLead && (
        <EditLeadModal open={Boolean(editingLead)} onClose={() => setEditingLead(null)} lead={editingLead} />
      )}

      {/* Find-email popover — anchored to the row's Email cell */}
      {findEmailFor && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFindEmailFor(null)} />
          <div
            className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3"
            style={{ top: findEmailFor.top, left: findEmailFor.left }}
          >
            <FindEmailPicker
              leadId={findEmailFor.lead.id}
              linkedinUrl={findEmailFor.lead.linkedin}
              onFound={(email) => {
                const leadId = findEmailFor.lead.id;
                setFindEmailFor(null);
                start(async () => {
                  await updateLead(leadId, { email });
                  toast("Email found and saved.", "success");
                  router.refresh();
                });
              }}
            />
          </div>
        </>
      )}

      {/* Row actions menu — kebab button in the rightmost column, Edit */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div className="fixed z-50 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1" style={{ top: rowMenu.top, left: rowMenu.left }}>
            <button
              onClick={() => { const id = rowMenu.id; const lead = paged.find((x) => x.id === id) || optimisticLeads.find((x) => x.id === id); setRowMenu(null); if (lead) setEditingLead(lead); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </>
      )}

      {/* Create Segment dialog */}
      <Modal open={segmentDialogOpen} onClose={() => setSegmentDialogOpen(false)} title="Create Segment" description="Save the selected leads as a segment you can target with campaigns." size="md">
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Segment name</label>
            <input
              autoFocus
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              placeholder="e.g. E-learning Prospects"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Description <span className="text-slate-400">(optional)</span></label>
            <Textarea
              value={segmentDescription}
              onChange={(e) => setSegmentDescription(e.target.value)}
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>Selected leads</span>
            <span className="font-semibold text-slate-900">{selected.length}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Segment type</label>
            <div className="space-y-2">
              <label className={cn("flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer", segmentType === "static" ? "border-blue-500 bg-blue-50/50" : "border-slate-200")}>
                <input type="radio" name="segment-type" className="mt-0.5" checked={segmentType === "static"} onChange={() => setSegmentType("static")} />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Static segment</span>
                  <span className="block text-xs text-slate-500">Always contains exactly these {selected.length} selected leads.</span>
                </span>
              </label>
              <label className={cn("flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer", segmentType === "dynamic" ? "border-blue-500 bg-blue-50/50" : "border-slate-200")}>
                <input type="radio" name="segment-type" className="mt-0.5" checked={segmentType === "dynamic"} onChange={() => setSegmentType("dynamic")} />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Dynamic segment</span>
                  <span className="block text-xs text-slate-500">Automatically adds leads matching defined conditions.</span>
                </span>
              </label>
            </div>
            {segmentType === "dynamic" && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Dynamic segments are built from rule conditions in the full{" "}
                <Link href="/segments/builder" className="underline font-medium">Segment Builder</Link>. This dialog can only create a Static segment from your selection.
              </p>
            )}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-slate-500">
              {selectedWithEmail} lead{selectedWithEmail === 1 ? "" : "s"} ready to email
              {selectedMissingEmail > 0 && <> · {selectedMissingEmail} lead{selectedMissingEmail === 1 ? "" : "s"} missing an email address</>}
            </p>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setSegmentDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateSegment} disabled={!segmentName.trim() || segmentType === "dynamic" || pending}>
            Create Segment
          </Button>
        </div>
      </Modal>

      {/* AI column header menu — run on all rows, or delete the column */}
      {aiColMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAiColMenu(null)} />
          <div
            className="fixed z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-xl p-1"
            style={{ top: aiColMenu.top, left: aiColMenu.left }}
          >
            <button
              onClick={() => runAiColumnOnAll(aiColMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              <Play className="h-3.5 w-3.5" /> Run on all leads
            </button>
            <button
              onClick={() => handleDeleteAiColumn(aiColMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete column
            </button>
          </div>
        </>
      )}

      {/* Column picker — fixed-position so the table's horizontal scroll never clips it */}
      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-2"
            style={{ top: colsPos.top, right: colsPos.right }}
          >
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {FIRST_COLUMNS.map((c) => (
                <div key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cols[c.key]}
                    onChange={() => toggleCol(c.key)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                  />
                  <span className="flex-1 inline-flex items-center gap-1.5">
                    {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400" />}
                    {c.label}
                  </span>
                  <span title="Always shown first — position is fixed" className="text-slate-300"><Lock className="h-3 w-3" /></span>
                </div>
              ))}
              <div className="my-1 border-t border-slate-100" />
              {colOrder.map((key, i) => {
                const c = columnByKey.get(key)!;
                return (
                  <div key={key} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={cols[c.key]}
                      onChange={() => toggleCol(c.key)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer flex-shrink-0"
                    />
                    <span className="flex-1 inline-flex items-center gap-1.5 min-w-0 truncate">
                      {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                      <span className="truncate">{c.label}</span>
                    </span>
                    <div className="flex items-center flex-shrink-0">
                      <button
                        onClick={() => moveCol(key, -1)}
                        disabled={i === 0}
                        title="Move up"
                        className="p-0.5 rounded hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                      <button
                        onClick={() => moveCol(key, 1)}
                        disabled={i === colOrder.length - 1}
                        title="Move down"
                        className="p-0.5 rounded hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button onClick={resetCols} className="w-full text-left px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
                Reset to default
              </button>
            </div>
          </div>
        </>
      )}

      {/* Filters popover — anchored near the count chip */}
      {filtersOpen && filtersPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
          <div
            className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3"
            style={{ top: filtersPos.top, left: filtersPos.left }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filters</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <Select value={quickFilter} onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}>
                <option value="all">All ({quickFilterCounts.all})</option>
                <option value="new">New ({quickFilterCounts.new})</option>
                <option value="qualified">Qualified ({quickFilterCounts.qualified})</option>
                <option value="hot">Hot Prospects ({quickFilterCounts.hot})</option>
                <option value="followup">Needs Follow-up ({quickFilterCounts.followup})</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Industry</label>
              <Select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                <option value="">All industries</option>
                {industries.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Interest area</label>
              <Select value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)}>
                <option value="">All interest areas</option>
                {interestAreas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setQuickFilter("all"); setIndustryFilter(""); setInterestFilter(""); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </>
      )}

      {/* Date-range popover — "Added between", its own dedicated toolbar button */}
      {datesOpen && datesPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDatesOpen(false)} />
          <div
            className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3"
            style={{ top: datesPos.top, left: datesPos.left }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Added between</p>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                aria-label="From date"
              />
              <span className="text-xs text-slate-400 flex-shrink-0">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                aria-label="To date"
              />
            </div>
            {hasActiveDateFilter && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear dates
              </button>
            )}
          </div>
        </>
      )}

      {/* Per-column header search popover */}
      {filterPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFilterPopover(null)} />
          <div
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-3"
            style={{ top: filterPopover.top, left: filterPopover.left }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Search {COLUMNS.find((c) => c.key === filterPopover.key)?.label}
            </p>
            <Input
              autoFocus
              leftIcon={<Search className="h-4 w-4" />}
              placeholder="Type a value…"
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyColumnFilter(); if (e.key === "Escape") setFilterPopover(null); }}
            />
            <div className="flex items-center justify-between mt-2.5">
              <button
                onClick={() => { clearColumnFilter(filterPopover.key); setFilterPopover(null); }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
              <Button size="sm" onClick={applyColumnFilter}>Apply</Button>
            </div>
          </div>
        </>
      )}

      {/* Floating selection action bar — white with a subtle shadow + green accents,
          positioned above rows without covering the toolbar. */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 dark:ring-slate-800 pl-5 pr-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
              <Check className="h-4 w-4 text-emerald-600" />
              {selected.length} lead{selected.length === 1 ? "" : "s"} selected
            </span>
            <span className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              onClick={openSegmentDialog}
              className="inline-flex items-center gap-1.5 rounded-full text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Layers3 className="h-3.5 w-3.5" /> Create Segment
            </button>
            <button
              onClick={handleAddToCampaign}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Megaphone className="h-3.5 w-3.5" /> Add to Campaign
            </button>
            <button
              onClick={handleBulkFindCompany}
              disabled={isBulkFindingCompany}
              className="inline-flex items-center gap-1.5 rounded-full text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
            >
              {isBulkFindingCompany ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current text-blue-600 dark:text-blue-400" />
              )}
              Find Companies
            </button>
            <div className="relative">
              <button
                onClick={() => setShowOwnerMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5" /> Assign Owner
              </button>
              {showOwnerMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowOwnerMenu(false)} />
                  <div className="lp-anim-pop origin-bottom-left absolute left-0 bottom-full mb-1 z-50 w-52 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg p-1">
                    {Object.keys(owners).length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400">No users found.</p>
                    )}
                    {Object.entries(owners).map(([id, name]) => (
                      <button
                        key={id}
                        onClick={() => handleAssignOwner(id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-left truncate"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              onClick={() => setSelected([])}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700 px-2 whitespace-nowrap"
            >
              Deselect all
            </button>
          </div>
        </div>
      )}
    </div>

    {showAiColumnModal && (
      <AiColumnModal
        open={showAiColumnModal}
        onClose={() => setShowAiColumnModal(false)}
        onCreated={() => router.refresh()}
        savedTemplates={aiColumnSavedTemplates}
      />
    )}

    </div>
  );
}

