"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DollarSign, TrendingUp, Trophy, Target, GripVertical, Pencil, Trash2, Loader2, Building2, Search,
  Filter as FilterIcon, X, ChevronDown, ChevronRight, Plus, List, LayoutGrid, Columns3,
  ArrowUp, ArrowDown, ArrowUpDown, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { formatDate, cn } from "@/lib/utils";
import { moveOpportunityStage, updateOpportunity, deleteOpportunity } from "@/lib/queries/opportunities";
import {
  OPPORTUNITY_STAGES, STAGE_LABELS,
  type OpportunityRow, type OpportunityStage, type PipelineStats,
} from "@/lib/opportunities";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

// Color accent per stage column header (kanban view)
const STAGE_ACCENT: Record<OpportunityStage, string> = {
  new: "bg-slate-400",
  qualified: "bg-blue-500",
  meeting_scheduled: "bg-indigo-500",
  proposal_sent: "bg-indigo-500",
  negotiation: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-red-400",
};

// Table-only display label — the kanban column header keeps the shorter "Won" from STAGE_LABELS.
const STAGE_TABLE_LABEL: Record<OpportunityStage, string> = { ...STAGE_LABELS, won: "Closed Won" };

function stageBadgeVariant(stage: OpportunityStage): "default" | "blue" | "purple" | "warning" | "success" | "danger" {
  switch (stage) {
    case "qualified": return "blue";
    case "meeting_scheduled": return "purple";
    case "proposal_sent": return "blue";
    case "negotiation": return "warning";
    case "won": return "success";
    case "lost": return "danger";
    default: return "default"; // new
  }
}

// Solid Open/Closed pill, matching the reference design — local to this table only.
function OpenClosedPill({ closed }: { closed: boolean }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold text-white ${closed ? "bg-red-500" : "bg-emerald-500"}`}>
      {closed ? "Closed" : "Open"}
    </span>
  );
}

type SortField = "created" | "name" | "dealValue" | "expectedClose";

function SortTh({ label, field, defaultDir = "desc", sortField, sortDir, onSort }: {
  label: string;
  field: SortField;
  defaultDir?: "asc" | "desc";
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField, defaultDir: "asc" | "desc") => void;
}) {
  const active = sortField === field;
  return (
    <DataTableTh className="text-[11px] uppercase tracking-wider">
      <button onClick={() => onSort(field, defaultDir)} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-700">
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
      </button>
    </DataTableTh>
  );
}

const PAGE_SIZE = 15;

export function OpportunitiesTable({ initial }: { initial: OpportunityRow[]; stats: PipelineStats }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<OpportunityRow[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<OpportunityStage | null>(null);
  const [editing, setEditing] = useState<OpportunityRow | null>(null);

  const [search, setSearch] = useState("");
  const [tileFilter, setTileFilter] = useState<"all" | "open" | "won" | "winrate">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hiddenStages, setHiddenStages] = useState<Set<OpportunityStage>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  function toggleSort(field: SortField, defaultDir: "asc" | "desc" = "desc") {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir(defaultDir); }
  }
  const [columnsOpen, setColumnsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const [visibleCols, setVisibleCols] = useState({ account: true, value: true, stage: true, closeDate: true, status: true });
  function toggleColumn(key: keyof typeof visibleCols) {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (filterOpen && filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
      if (columnsOpen && colsRef.current && !colsRef.current.contains(t)) setColumnsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filterOpen, columnsOpen]);

  // Stable per-row display ID (e.g. #OPP001) based on the server's original order — doesn't
  // reshuffle when the table is sorted, since real opportunities only have a UUID.
  const displayIdMap = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r, i) => map.set(r.id, `#OPP${String(i + 1).padStart(3, "0")}`));
    return map;
  }, [rows]);

  function toggleStageVisible(s: OpportunityStage) {
    setHiddenStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }
  function resetFilters() {
    setSearch(""); setDateFrom(""); setDateTo(""); setHiddenStages(new Set()); setTileFilter("all");
  }
  const activeFilterCount = (search ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (hiddenStages.size > 0 ? 1 : 0) + (tileFilter !== "all" ? 1 : 0);

  const filteredRows = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.company || "").toLowerCase().includes(q);
    const matchFrom = !dateFrom || (!!r.expected_close_date && r.expected_close_date >= dateFrom);
    const matchTo = !dateTo || (!!r.expected_close_date && r.expected_close_date <= dateTo);
    const matchStage = !hiddenStages.has(r.stage);
    
    let matchTile = true;
    if (tileFilter === "open") matchTile = r.stage !== "won" && r.stage !== "lost";
    else if (tileFilter === "won") matchTile = r.stage === "won";
    else if (tileFilter === "winrate") matchTile = r.stage === "won" || r.stage === "lost";
    
    return matchSearch && matchFrom && matchTo && matchStage && matchTile;
  }), [rows, search, dateFrom, dateTo, hiddenStages, tileFilter]);

  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => {
    let cmp: number;
    switch (sortField) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "dealValue": cmp = Number(a.deal_value || 0) - Number(b.deal_value || 0); break;
      case "expectedClose": cmp = (a.expected_close_date || "").localeCompare(b.expected_close_date || ""); break;
      default: cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDir === "asc" ? cmp : -cmp;
  }), [filteredRows, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = useMemo(
    () => sortedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, safePage]
  );

  const byStage = useMemo(() => {
    const map: Record<OpportunityStage, OpportunityRow[]> = {
      new: [], qualified: [], meeting_scheduled: [], proposal_sent: [], negotiation: [], won: [], lost: [],
    };
    for (const r of sortedRows) (map[r.stage] || map.new).push(r);
    return map;
  }, [sortedRows]);

  // Live-recompute the header tiles from local state so they update on drag
  const live = useMemo<PipelineStats>(() => {
    const open = rows.filter((r) => r.stage !== "won" && r.stage !== "lost");
    const won = rows.filter((r) => r.stage === "won");
    const lost = rows.filter((r) => r.stage === "lost");
    const closed = won.length + lost.length;
    return {
      openValue: open.reduce((s, r) => s + Number(r.deal_value || 0), 0),
      openCount: open.length,
      wonValue: won.reduce((s, r) => s + Number(r.deal_value || 0), 0),
      wonCount: won.length,
      lostCount: lost.length,
      winRate: closed ? Math.round((won.length / closed) * 1000) / 10 : 0,
    };
  }, [rows]);

  async function drop(stage: OpportunityStage) {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (!id) return;
    const current = rows.find((r) => r.id === id);
    if (!current || current.stage === stage) return;
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage } : r)));
    try {
      await moveOpportunityStage(id, stage);
    } catch {
      setRows(prev);
      toast("Could not move the deal. Try again.", "error");
    }
  }

  async function remove(row: OpportunityRow) {
    const ok = await confirm({ title: "Delete opportunity?", message: `"${row.name}" will be permanently removed.`, danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    try {
      await deleteOpportunity(row.id);
      toast("Opportunity deleted.", "success");
    } catch {
      setRows(prev);
      toast("Delete failed.", "error");
    }
  }

  const tiles = [
    { label: "Open pipeline", value: money(live.openValue), sub: `${live.openCount} open deal${live.openCount === 1 ? "" : "s"}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400", key: "open", ring: "ring-blue-500", bg: "bg-blue-50/30 dark:bg-blue-950/10" },
    { label: "Won revenue", value: money(live.wonValue), sub: `${live.wonCount} won`, icon: <Trophy className="h-5 w-5" />, color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400", key: "won", ring: "ring-emerald-500", bg: "bg-emerald-50/30 dark:bg-emerald-950/10" },
    { label: "Win rate", value: `${live.winRate}%`, sub: `${live.wonCount} won · ${live.lostCount} lost`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400", key: "winrate", ring: "ring-indigo-500", bg: "bg-indigo-50/30 dark:bg-indigo-950/10" },
    { label: "Total deals", value: String(rows.length), sub: "in pipeline", icon: <Target className="h-5 w-5" />, color: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400", key: "all", ring: "ring-amber-500", bg: "bg-amber-50/30 dark:bg-amber-950/10" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto w-full">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Opportunities</h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mt-1">
            <span>Home</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600 dark:text-slate-600 font-medium">Opportunities</span>
          </div>
        </div>
        {/* Opportunities can only be created by converting a lead (no standalone-create endpoint exists),
            so this links to Leads rather than faking an "Add Opportunity" form. */}
        <Link href="/leads">
          <Button><Plus className="h-4 w-4" /> Convert a lead</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map((t) => {
          const active = tileFilter === t.key;
          return (
            <Card
              key={t.label}
              onClick={() => {
                setTileFilter(t.key as any);
                setPage(0);
              }}
              className={cn(
                "p-4 cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-xs",
                active
                  ? `ring-2 ${t.ring} ${t.bg} border-transparent shadow-xs`
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-500">{t.label}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{t.value}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t.sub}</p>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${t.color}`}>{t.icon}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center dark:bg-slate-900 dark:border-slate-800">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-[var(--muted)] flex items-center justify-center mb-4">
            <Target className="h-6 w-6 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white">No opportunities yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1 max-w-md mx-auto">
            Open a lead and click <span className="font-medium text-slate-700 dark:text-slate-700">Convert to Opportunity</span> to start building your pipeline.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input
                leftIcon={<Search className="h-4 w-4" />}
                placeholder="Search deals or companies..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>

            {/* Count / Filter Chip */}
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-400 flex-shrink-0 whitespace-nowrap h-10 shadow-3xs">
              <Target className="h-4 w-4 text-slate-400" />
              <span>
                {filteredRows.length}{" "}
                {tileFilter === "open"
                  ? "Open Deal"
                  : tileFilter === "won"
                  ? "Closed Won"
                  : tileFilter === "winrate"
                  ? "Closed Deal"
                  : "Deal"}
                {filteredRows.length === 1 ? "" : "s"}
              </span>
              {tileFilter !== "all" && (
                <button
                  onClick={() => { setTileFilter("all"); setPage(0); }}
                  title="Clear filter"
                  className="p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="relative" ref={filterRef}>
              <Button variant="outline" onClick={() => setFilterOpen((v) => !v)}>
                <FilterIcon className="h-4 w-4" /> Filter
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
              </Button>
              {filterOpen && (
                <div className="lp-anim-pop origin-top-left absolute left-0 top-full mt-1 z-20 w-72 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white"><FilterIcon className="h-4 w-4" /> Filter</span>
                    <button onClick={() => setFilterOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[var(--muted)] text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 mb-1.5">Expected close — start</p>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                        max={dateTo || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 mb-1.5">Expected close — end</p>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                        min={dateFrom || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 mb-1.5">Stage columns shown</p>
                      <div className="flex flex-col gap-1.5">
                        {OPPORTUNITY_STAGES.map((s) => (
                          <label key={s} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!hiddenStages.has(s)}
                              onChange={() => toggleStageVisible(s)}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                            />
                            {STAGE_LABELS[s]}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 border-t border-slate-100 dark:border-slate-800">
                    <Button variant="outline" className="flex-1" onClick={resetFilters}>Reset</Button>
                    <Button className="flex-1" onClick={() => setFilterOpen(false)}>Filter</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            {viewMode === "table" && (
              <Select
                value={`${sortField}:${sortDir}`}
                onChange={(e) => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as "asc" | "desc"); }}
                className="w-auto max-w-[190px]"
              >
                <option value="created:desc">Sort: Newest first</option>
                <option value="created:asc">Sort: Oldest first</option>
                <option value="name:asc">Sort: Name A-Z</option>
                <option value="dealValue:desc">Sort: Highest value</option>
                <option value="expectedClose:asc">Sort: Closing soonest</option>
              </Select>
            )}

            <div className="ml-auto flex items-center gap-2">
              {viewMode === "table" && (
                <div className="relative" ref={colsRef}>
                  <button
                    onClick={() => setColumnsOpen((v) => !v)}
                    className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border text-sm font-medium transition-colors ${
                      columnsOpen ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300" : "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    }`}
                  >
                    <Columns3 className="h-4 w-4" /> Manage Columns
                  </button>
                  {columnsOpen && (
                    <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden p-1">
                      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Show columns</p>
                      {([
                        ["account", "Account"],
                        ["value", "Expected Value"],
                        ["stage", "Stage"],
                        ["closeDate", "Expected Close Date"],
                        ["status", "Status"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-[var(--muted)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={visibleCols[key]}
                            onChange={() => toggleColumn(key)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5">
                <button
                  onClick={() => setViewMode("table")}
                  aria-label="Table view"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-600"}`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  aria-label="Kanban view"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-600"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  toast("Refreshing opportunities...", "info");
                  router.refresh();
                  setTimeout(() => window.location.reload(), 100);
                }}
                className="h-9 w-9 p-0 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>

          {filteredRows.length === 0 && (
            <Card className="p-12 text-center mb-4 dark:bg-slate-900 dark:border-slate-800">
              <p className="font-semibold text-slate-900 dark:text-white">No opportunities match your filters</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Try widening the date range or clearing the search.</p>
            </Card>
          )}

          {filteredRows.length > 0 && viewMode === "table" && (
            <Card className="overflow-hidden dark:bg-slate-900 dark:border-slate-800">
              <DataTable className="min-w-[880px]">
                <DataTableHead>
                  <tr className="text-left text-[11px] uppercase tracking-wider">
                    <DataTableTh className="text-[11px] uppercase tracking-wider">Opportunity ID</DataTableTh>
                    <SortTh label="Opportunity Name" field="name" defaultDir="asc" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    {visibleCols.account && <DataTableTh className="text-[11px] uppercase tracking-wider">Account</DataTableTh>}
                    {visibleCols.value && <SortTh label="Expected Value" field="dealValue" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                    {visibleCols.stage && <DataTableTh className="text-[11px] uppercase tracking-wider">Stage</DataTableTh>}
                    {visibleCols.closeDate && <SortTh label="Expected Close Date" field="expectedClose" defaultDir="asc" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                    {visibleCols.status && <DataTableTh className="text-[11px] uppercase tracking-wider">Status</DataTableTh>}
                    <DataTableTh className="w-8" />
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {pagedRows.length === 0 && (
                    <DataTableEmpty colSpan={8}>No deals on this page.</DataTableEmpty>
                  )}
                  {pagedRows.map((row) => {
                    const closed = row.stage === "won" || row.stage === "lost";
                    return (
                      <DataTableRow key={row.id} onClick={() => router.push(`/opportunities/${row.id}`)} className="cursor-pointer">
                        <DataTableTd className="text-slate-500 dark:text-slate-500 font-medium whitespace-nowrap">{displayIdMap.get(row.id)}</DataTableTd>
                        <DataTableTd className="font-medium text-slate-900 dark:text-slate-800">{row.name}</DataTableTd>
                        {visibleCols.account && (
                          <DataTableTd>
                            {row.company ? (
                              <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-600">
                                <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                                  {row.company.charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate max-w-[160px]">{row.company}</span>
                              </span>
                            ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                          </DataTableTd>
                        )}
                        {visibleCols.value && <DataTableTd className="text-slate-600 dark:text-slate-600">{money(Number(row.deal_value || 0))}</DataTableTd>}
                        {visibleCols.stage && <DataTableTd><Badge variant={stageBadgeVariant(row.stage)}>{STAGE_TABLE_LABEL[row.stage]}</Badge></DataTableTd>}
                        {visibleCols.closeDate && <DataTableTd className="text-slate-500 dark:text-slate-500 whitespace-nowrap">{row.expected_close_date ? formatDate(row.expected_close_date) : "—"}</DataTableTd>}
                        {visibleCols.status && <DataTableTd><OpenClosedPill closed={closed} /></DataTableTd>}
                        <DataTableTd onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <button
                              onClick={() => setEditing(row)}
                              aria-label="Edit opportunity"
                              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[var(--muted)] text-slate-400 hover:text-slate-600 dark:hover:text-slate-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </DataTableTd>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
              <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={sortedRows.length} onPageChange={(p) => setPage(p - 1)} />
            </Card>
          )}

          {filteredRows.length > 0 && viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {OPPORTUNITY_STAGES.filter((stage) => !hiddenStages.has(stage)).map((stage) => {
            const items = byStage[stage];
            const colValue = items.reduce((s, r) => s + Number(r.deal_value || 0), 0);
            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={() => drop(stage)}
                className={`w-72 flex-shrink-0 rounded-xl border transition-colors ${overStage === stage ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[var(--muted)]"}`}
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STAGE_ACCENT[stage]}`} />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-700">{STAGE_LABELS[stage]}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{items.length}</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-500">{money(colValue)}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {items.map((row) => (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={() => setDragId(row.id)}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      onClick={() => router.push(`/opportunities/${row.id}`)}
                      className={`group bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm cursor-grab active:cursor-grabbing ${dragId === row.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{row.name}</p>
                          {row.company && (
                            <p className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <Building2 className="h-3 w-3 flex-shrink-0" /> {row.company}
                            </p>
                          )}
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5">{money(Number(row.deal_value || 0))}</p>
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setEditing(row); }} aria-label="Edit" className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); remove(row); }} aria-label="Delete" className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-rose-950/40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
          )}
        </>
      )}

      {editing && (
        <EditOpportunityModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
            toast("Opportunity updated.", "success");
          }}
        />
      )}
    </div>
  );
}

function EditOpportunityModal({ row, onClose, onSaved }: { row: OpportunityRow; onClose: () => void; onSaved: (r: OpportunityRow) => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(row.name);
  const [company, setCompany] = useState(row.company || "");
  const [value, setValue] = useState(String(row.deal_value || 0));
  const [stage, setStage] = useState<OpportunityStage>(row.stage);
  const [closeDate, setCloseDate] = useState(row.expected_close_date || "");
  const [notes, setNotes] = useState(row.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const dealValue = parseFloat(value) || 0;
      await updateOpportunity(row.id, {
        name, company, dealValue, stage,
        expectedCloseDate: closeDate || null, notes,
      });
      onSaved({ ...row, name, company, deal_value: dealValue, stage, expected_close_date: closeDate || null, notes });
    } catch {
      toast("Save failed.", "error");
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Modal open onClose={onClose} title="Edit opportunity" size="md">
      <div className="p-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Deal name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Company</label>
            <input className={field} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Deal value ($)</label>
            <input type="number" min="0" className={field} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Stage</label>
            <select className={field} value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
              {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Expected close</label>
            <input type="date" className={field} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-600">Notes</label>
          <textarea className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
        </Button>
      </div>
    </Modal>
  );
}
