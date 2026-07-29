"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Filter, Plus, Trash2, ChevronDown, ChevronUp, Lock, Users2, Mail, Briefcase, User, UserCog, Clock, ArrowUpDown, Building2, Settings2, Phone, Globe, Calendar, Link2, CheckCircle2, XCircle, Tag, Share2, Layers3, X, Sparkles, Loader2, MoreVertical, Play, Megaphone, UserPlus, Check, type LucideIcon } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { industries, interestAreas } from "@/lib/mock-data";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { AiColumnModal } from "@/components/leads/ai-column-modal";
import { EditLeadModal } from "@/components/leads/edit-lead-modal";
import { FindEmailPicker } from "@/components/leads/find-email-picker";
import { deleteLead, bulkDeleteLeads, updateLead, type LeadRow } from "@/lib/queries/leads";
import { createStaticSegment } from "@/lib/queries/segments";
import { runAiColumn, deleteAiColumn, getAiColumnProgress, type AiColumnDefinitionRow, type AiColumnSavedTemplateRow } from "@/lib/queries/ai-columns";

// "Hot"/"Warm"/"Scored" are legacy values (never set by any live code path,
// kept only so old data — if any — still renders a real color instead of a
// gray "default" badge) alongside the current New/Contacted/Qualified/
// Nurturing/Converted vocabulary.
const statusVariant: Record<string, "default" | "blue" | "warning" | "danger" | "success" | "purple"> = {
  New: "blue",
  Contacted: "purple",
  Qualified: "success",
  Nurturing: "warning",
  Converted: "success",
  Warm: "warning",
  Hot: "danger",
  Scored: "purple",
};

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
  { key: "name", label: "Lead", icon: User, defaultOn: true },
];
const REORDERABLE_COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company", icon: Building2, defaultOn: true },
  { key: "email", label: "Email", icon: Mail, defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "score", label: "AI Score", icon: Sparkles, defaultOn: true },
  { key: "source", label: "Source", icon: Globe, defaultOn: true },
  { key: "owner", label: "Owner", icon: UserCog, defaultOn: true },
  { key: "last_activity", label: "Last Activity", icon: Clock, defaultOn: true },
  { key: "industry", label: "Industry", icon: Briefcase, defaultOn: false },
  { key: "phone", label: "Phone", icon: Phone, defaultOn: false },
  { key: "interest_area", label: "Interest area", icon: Tag, defaultOn: false },
  { key: "linkedin", label: "LinkedIn", icon: Share2, defaultOn: false },
  { key: "website", label: "Website", icon: Link2, defaultOn: false },
  { key: "verified", label: "Verified", icon: CheckCircle2, defaultOn: false },
  { key: "created_at", label: "Added", icon: Calendar, defaultOn: false },
];
const COLUMNS: ColumnDef[] = [...FIRST_COLUMNS, ...REORDERABLE_COLUMNS];
const DEFAULT_ORDER: ColKey[] = REORDERABLE_COLUMNS.map((c) => c.key);

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_leads_columns";
const COLS_ORDER_STORAGE_KEY = "lp_leads_column_order";

interface Props {
  leads: LeadRow[];
  /** Accepted for backwards-compat with the page; the stat strip was removed. */
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

export function LeadsTable({ leads, campaignFilter, initialSearch, aiColumns = [], aiColumnSavedTemplates = [], owners = {} }: Props) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [industryFilter, setIndustryFilter] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [page, setPage] = useState(0);

  // Quick status/score filters — a row of pill shortcuts above the table.
  // "Needs Follow-up" is a chosen proxy (no dedicated field exists): a lead
  // that's been Contacted or is in Nurturing, i.e. worked but not yet resolved.
  type QuickFilter = "all" | "new" | "qualified" | "hot" | "followup";
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // Missing-data quick actions — inline instead of a bare "—".
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [findEmailFor, setFindEmailFor] = useState<{ lead: LeadRow; top: number; left: number } | null>(null);

  // Selection contextual bar — replaces the toolbar controls while rows are selected.
  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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
  const [sort, setSort] = useState<"none" | "name" | "score" | "newest">("none");
  const scrollRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 15;

  // Per-column header search (click a header to filter by that column's value).
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [filterPopover, setFilterPopover] = useState<{ key: ColKey; top: number; left: number } | null>(null);
  const [filterDraft, setFilterDraft] = useState("");

  // Industry/interest/date filters — opened as a popover next to the count chip.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState<{ top: number; left: number } | null>(null);
  const hasActiveFilters = Boolean(industryFilter || interestFilter || dateFrom || dateTo || quickFilter !== "all");
  function openFiltersPopover(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setFiltersPos({ top: r.bottom + 6, left: r.left });
    setFiltersOpen(true);
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
    setRunProgress({ columnId, done: 0, total: leads.length });

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

  const baseFiltered = leads.filter((l) => {
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

    const created = new Date(l.created_at);
    const matchDateFrom = !dateFrom || created >= new Date(`${dateFrom}T00:00:00`);
    const matchDateTo = !dateTo || created <= new Date(`${dateTo}T23:59:59`);

    const matchColumns = activeColumnFilterKeys.every((k) => {
      const v = (columnFilters[k] || "").toLowerCase();
      return getColumnText(k, l).toLowerCase().includes(v);
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

  const filtered = baseFiltered.filter((l) => matchesQuickFilter(l, quickFilter));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return (a.full_name || a.company_name || "").localeCompare(b.full_name || b.company_name || "");
    if (sort === "score") return (b.lead_score || 0) - (a.lead_score || 0);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
  function getColumnText(key: ColKey, l: LeadRow): string {
    switch (key) {
      case "name": return displayName(l);
      case "company": return l.company_name || "";
      case "email": return l.email || "";
      case "status": return l.status || "";
      case "score": return `${l.lead_score ?? ""} ${scoreLevel(l.lead_score ?? 0).label}`;
      case "source": return l.source || "";
      case "owner": return (l.owner_id && owners[l.owner_id]) || "";
      case "last_activity": return new Date(l.updated_at).toLocaleDateString();
      case "industry": return l.industry || "";
      case "phone": return l.phone || "";
      case "interest_area": return l.interest_area || "";
      case "linkedin": return l.linkedin || "";
      case "website": return l.website_url || "";
      case "verified": return l.verified ? "Verified" : "No";
      case "created_at": return new Date(l.created_at).toLocaleDateString();
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

  const selectedLeads = leads.filter((l) => selected.includes(l.id));
  const selectedWithEmail = selectedLeads.filter((l) => l.email).length;
  const selectedMissingEmail = selectedLeads.length - selectedWithEmail;

  async function handleBulkDelete() {
    setShowMoreMenu(false);
    const n = selected.length;
    if (!(await confirm({ title: "Delete lead?", message: `Delete ${n} lead${n === 1 ? "" : "s"}? This action cannot be undone.`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteLeads(ids); // single query instead of N round-trips
    });
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

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete lead?", message: "Delete this lead? This action cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteLead(id);
      setSelected((s) => s.filter((x) => x !== id));
    });
  }

  function renderCell(key: ColKey, l: LeadRow, rowNumber: number) {
    switch (key) {
      case "index":
        return <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono text-xs">{rowNumber}</span>;
      case "name": {
        const name = displayName(l);
        return (
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
        );
      }
      case "company":
        return l.company_name ? (
          <span className="block max-w-[180px] truncate text-slate-700 dark:text-slate-300 whitespace-nowrap" title={l.company_name}>{l.company_name}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingLead(l); }}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" /> Add company
          </button>
        );
      case "email":
        return l.email ? (
          <span className="block max-w-[240px] truncate text-slate-600 dark:text-slate-300 whitespace-nowrap" title={l.email}>{l.email}</span>
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
          <span className="block max-w-[160px] truncate text-slate-600 dark:text-slate-400 whitespace-nowrap" title={l.industry}>{l.industry}</span>
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
        return <Badge variant={statusVariant[l.status] || "default"}>{l.status}</Badge>;
      case "phone":
        return l.phone ? (
          <span className="text-slate-600 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{l.phone}</span>
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
        return <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px] block whitespace-nowrap">{l.interest_area || "—"}</span>;
      case "source":
        return <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px] block whitespace-nowrap">{l.source || "—"}</span>;
      case "owner":
        return (
          <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px] block whitespace-nowrap">
            {(l.owner_id && owners[l.owner_id]) || <span className="text-slate-400">Unassigned</span>}
          </span>
        );
      case "last_activity":
        return <span className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{new Date(l.updated_at).toLocaleDateString()}</span>;
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
        return <span className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-4">
    <div className={showAiColumnModal ? "flex-1 min-w-0" : "max-w-[1600px] mx-auto w-full"}>
      {campaignFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <p className="text-sm text-blue-900">
            Showing <span className="font-semibold">{leads.length}</span> lead{leads.length === 1 ? "" : "s"} in campaign <span className="font-semibold">{campaignFilter.name}</span>
            <span className="text-blue-700/70"> · click a lead to see its email stages</span>
          </p>
          <Link href="/leads" className="text-sm font-medium text-blue-700 hover:text-blue-900">Clear filter ✕</Link>
        </div>
      )}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
          {/* Left Controls: Search + Count + Compact Tool Buttons */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            {/* Search Input */}
            <div className="w-36 sm:w-48 md:w-56 flex-shrink-0">
              <Input
                leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>

            {/* Count Chip */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0 whitespace-nowrap">
              <Users2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{filtered.length} Lead{filtered.length === 1 ? "" : "s"}</span>
            </div>

            {/* Filter Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openFiltersPopover}
              className={cn(
                "rounded-xl gap-1 font-medium h-8 text-xs px-2.5 flex-shrink-0",
                hasActiveFilters && "ring-1 ring-blue-500/30 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              )}
              title="Filter leads"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filter</span>
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
            </Button>

            {/* Columns Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openColsMenu}
              className="rounded-xl gap-1 font-medium h-8 text-xs px-2.5 text-slate-700 dark:text-slate-300 flex-shrink-0"
              title="Customize visible columns"
            >
              <Settings2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Columns</span>
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
          </div>

          {/* Right Controls: Sort Dropdown + Add Lead */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* Sort Dropdown */}
            <div className="relative inline-flex items-center flex-shrink-0 w-[88px]">
              <ArrowUpDown className="h-3 w-3 text-slate-400 absolute left-2 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="appearance-none w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-6 pr-5 py-1 h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm cursor-pointer truncate"
              >
                <option value="none">Sort</option>
                <option value="name">Name A–Z</option>
                <option value="score">Score High→Low</option>
                <option value="newest">Newest</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 pointer-events-none" />
            </div>

            {/* Add Lead — opens the source-picker screen directly (Manual, CSV, LinkedIn, Buy Leads, etc.) */}
            <Button
              size="sm"
              onClick={() => setShowWizard(true)}
              className="rounded-xl gap-1.5 font-bold h-8 px-3 text-xs flex-shrink-0 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Lead</span>
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="relative">
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] scrollbar-hide">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead className="bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-20 backdrop-blur-md">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="sticky left-0 z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                  </th>
                  {visibleCols.map((c) => {
                    const filterable = c.key !== "index";
                    const active = Boolean(columnFilters[c.key]);
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          "px-3 py-2.5 font-bold whitespace-nowrap",
                          c.key === "index" && "w-12 sticky left-10 z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md",
                          c.key === "name" && "sticky left-[88px] z-20 bg-slate-50/90 dark:bg-slate-950/80 backdrop-blur-md"
                        )}
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
                  <th className="px-3 py-2.5 w-12 text-right font-bold text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + aiColumns.length + 2} className="px-4 py-16 text-center text-slate-500">
                      No leads yet. Click <strong>Add Leads</strong> to import from LinkedIn, social, or a CSV.
                    </td>
                  </tr>
                )}
                {paged.map((l, i) => (
                  <tr
                    key={l.id}
                    onClick={() => openLead(l.id)}
                    className="group hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(l.id)}
                        onChange={() => toggle(l.id)}
                        className="rounded border-slate-300"
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
                        onClick={c.key === "linkedin" || c.key === "website" ? (e) => e.stopPropagation() : undefined}
                      >
                        {renderCell(c.key, l, safePage * PAGE_SIZE + i + 1)}
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
                        onClick={() => handleDelete(l.id)}
                        disabled={pending}
                        title="Delete lead"
                        className="p-1 rounded-md hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <span>
            {filtered.length === 0
              ? "Showing 0 of 0"
              : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Page {safePage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
              Next <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
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
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
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
                <option value="hot">Hot Leads ({quickFilterCounts.hot})</option>
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
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Added between</label>
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
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setQuickFilter("all"); setIndustryFilter(""); setInterestFilter(""); setDateFrom(""); setDateTo(""); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear filters
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
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left truncate"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className="inline-flex items-center gap-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
              >
                More <ChevronDown className={cn("h-3 w-3 transition-transform", showMoreMenu && "rotate-180")} />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="lp-anim-pop origin-bottom-left absolute left-0 bottom-full mb-1 z-50 w-44 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg p-1">
                    <button
                      onClick={handleBulkDelete}
                      disabled={pending}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-left"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              onClick={() => setSelected([])}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 whitespace-nowrap"
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

