"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DollarSign, TrendingUp, Trophy, Target, GripVertical, Pencil, Trash2, Loader2, Building2, Search,
  Filter as FilterIcon, X, ChevronDown, ChevronRight, Plus, List, LayoutGrid, Columns3,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { formatDate } from "@/lib/utils";
import { moveOpportunityStage, updateOpportunity, deleteOpportunity } from "@/lib/queries/opportunities";
import {
  OPPORTUNITY_STAGES, STAGE_LABELS,
  type OpportunityRow, type OpportunityStage, type PipelineStats,
} from "@/lib/opportunities";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

// Color accent per stage column header
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
    <th className="px-3 py-3 font-semibold">
      <button onClick={() => onSort(field, defaultDir)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
      </button>
    </th>
  );
}

export function PipelineBoard({ initial, stats }: { initial: OpportunityRow[]; stats: PipelineStats }) {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<OpportunityRow[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<OpportunityStage | null>(null);
  const [editing, setEditing] = useState<OpportunityRow | null>(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hiddenStages, setHiddenStages] = useState<Set<OpportunityStage>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
    setSearch(""); setDateFrom(""); setDateTo(""); setHiddenStages(new Set());
  }
  const activeFilterCount = (search ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (hiddenStages.size > 0 ? 1 : 0);

  const filteredRows = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.company || "").toLowerCase().includes(q);
    const matchFrom = !dateFrom || (!!r.expected_close_date && r.expected_close_date >= dateFrom);
    const matchTo = !dateTo || (!!r.expected_close_date && r.expected_close_date <= dateTo);
    const matchStage = !hiddenStages.has(r.stage);
    return matchSearch && matchFrom && matchTo && matchStage;
  }), [rows, search, dateFrom, dateTo, hiddenStages]);

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
    { label: "Open pipeline", value: money(live.openValue), sub: `${live.openCount} open deal${live.openCount === 1 ? "" : "s"}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
    { label: "Won revenue", value: money(live.wonValue), sub: `${live.wonCount} won`, icon: <Trophy className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600" },
    { label: "Win rate", value: `${live.winRate}%`, sub: `${live.wonCount} won · ${live.lostCount} lost`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-indigo-50 text-indigo-600" },
    { label: "Total deals", value: String(rows.length), sub: "in pipeline", icon: <Target className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div>
      {/* Custom header (breadcrumb + count badge) — kept local to this page, doesn't touch the shared PageHeader used elsewhere */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Opportunities</h1>
            <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold">
              {rows.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>Home</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600 font-medium">Opportunities</span>
          </div>
        </div>
        {/* Opportunities can only be created by converting a lead (no standalone-create endpoint exists),
            so this links to Leads rather than faking an "Add Opportunity" form. */}
        <Link href="/leads">
          <Button><Plus className="h-4 w-4" /> Convert a lead</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{t.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.sub}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${t.color}`}>{t.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Target className="h-6 w-6 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-900">No opportunities yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Open a lead and click <span className="font-medium text-slate-700">Convert to Opportunity</span> to start building your pipeline.
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
                onChange={(e) => setSearch(e.target.value)}
              />
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
                <div className="lp-anim-pop origin-top-left absolute left-0 top-full mt-1 z-20 w-72 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900"><FilterIcon className="h-4 w-4" /> Filter</span>
                    <button onClick={() => setFilterOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Expected close — start</p>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        max={dateTo || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Expected close — end</p>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        min={dateFrom || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Stage columns shown</p>
                      <div className="flex flex-col gap-1.5">
                        {OPPORTUNITY_STAGES.map((s) => (
                          <label key={s} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!hiddenStages.has(s)}
                              onChange={() => toggleStageVisible(s)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            {STAGE_LABELS[s]}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 border-t border-slate-100">
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
                      columnsOpen ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-indigo-50/60 border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                    }`}
                  >
                    <Columns3 className="h-4 w-4" /> Manage Columns
                  </button>
                  {columnsOpen && (
                    <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden p-1">
                      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
                      {([
                        ["account", "Account"],
                        ["value", "Expected Value"],
                        ["stage", "Stage"],
                        ["closeDate", "Expected Close Date"],
                        ["status", "Status"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={visibleCols[key]}
                            onChange={() => toggleColumn(key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
                <button
                  onClick={() => setViewMode("table")}
                  aria-label="Table view"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  aria-label="Kanban view"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {filteredRows.length === 0 && (
            <Card className="p-12 text-center mb-4">
              <p className="font-semibold text-slate-900">No opportunities match your filters</p>
              <p className="text-sm text-slate-500 mt-1">Try widening the date range or clearing the search.</p>
            </Card>
          )}

          {filteredRows.length > 0 && viewMode === "table" && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[880px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 font-semibold">Opportunity ID</th>
                      <SortTh label="Opportunity Name" field="name" defaultDir="asc" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      {visibleCols.account && <th className="px-3 py-3 font-semibold">Account</th>}
                      {visibleCols.value && <SortTh label="Expected Value" field="dealValue" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                      {visibleCols.stage && <th className="px-3 py-3 font-semibold">Stage</th>}
                      {visibleCols.closeDate && <SortTh label="Expected Close Date" field="expectedClose" defaultDir="asc" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                      {visibleCols.status && <th className="px-3 py-3 font-semibold">Status</th>}
                      <th className="px-3 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRows.map((row) => {
                      const closed = row.stage === "won" || row.stage === "lost";
                      return (
                        <tr key={row.id} onClick={() => setEditing(row)} className="cursor-pointer hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-slate-500 font-medium whitespace-nowrap">{displayIdMap.get(row.id)}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">{row.name}</td>
                          {visibleCols.account && (
                            <td className="px-3 py-3">
                              {row.company ? (
                                <span className="inline-flex items-center gap-2 text-slate-700">
                                  <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                                    {row.company.charAt(0).toUpperCase()}
                                  </span>
                                  <span className="truncate max-w-[160px]">{row.company}</span>
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </td>
                          )}
                          {visibleCols.value && <td className="px-3 py-3 text-slate-600">{money(Number(row.deal_value || 0))}</td>}
                          {visibleCols.stage && <td className="px-3 py-3"><Badge variant={stageBadgeVariant(row.stage)}>{STAGE_TABLE_LABEL[row.stage]}</Badge></td>}
                          {visibleCols.closeDate && <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{row.expected_close_date ? formatDate(row.expected_close_date) : "—"}</td>}
                          {visibleCols.status && <td className="px-3 py-3"><OpenClosedPill closed={closed} /></td>}
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                              <button
                                onClick={() => setEditing(row)}
                                aria-label="Edit opportunity"
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                className={`w-72 flex-shrink-0 rounded-xl border transition-colors ${overStage === stage ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-slate-50/60"}`}
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STAGE_ACCENT[stage]}`} />
                    <span className="text-sm font-semibold text-slate-700">{STAGE_LABELS[stage]}</span>
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{money(colValue)}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {items.map((row) => (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={() => setDragId(row.id)}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      className={`group bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing ${dragId === row.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
                          {row.company && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <Building2 className="h-3 w-3 flex-shrink-0" /> {row.company}
                            </p>
                          )}
                          <p className="text-sm font-semibold text-emerald-600 mt-1.5">{money(Number(row.deal_value || 0))}</p>
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditing(row)} aria-label="Edit" className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(row)} aria-label="Delete" className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
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

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Modal open onClose={onClose} title="Edit opportunity" size="md">
      <div className="p-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Deal name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Company</label>
            <input className={field} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Deal value ($)</label>
            <input type="number" min="0" className={field} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Stage</label>
            <select className={field} value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
              {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Expected close</label>
            <input type="date" className={field} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Notes</label>
          <textarea className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
        </Button>
      </div>
    </Modal>
  );
}
