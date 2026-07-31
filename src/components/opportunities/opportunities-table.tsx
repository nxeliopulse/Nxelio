"use client";
import { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Trophy, Target, Pencil, Trash2, Loader2, Building2, Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { moveOpportunityStage, updateOpportunity, deleteOpportunity } from "@/lib/queries/opportunities";
import {
  OPPORTUNITY_STAGES, STAGE_LABELS,
  type OpportunityRow, type OpportunityStage, type PipelineStats,
} from "@/lib/opportunities";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

// Soft badge variant per stage — same semantic grouping the old kanban's
// STAGE_ACCENT dot colors used (slate/blue/indigo/indigo/amber/emerald/red).
const STAGE_BADGE: Record<OpportunityStage, "default" | "blue" | "purple" | "warning" | "success" | "danger"> = {
  new: "default",
  qualified: "blue",
  meeting_scheduled: "purple",
  proposal_sent: "purple",
  negotiation: "warning",
  won: "success",
  lost: "danger",
};

const PAGE_SIZE = 15;

export function OpportunitiesTable({ initial }: { initial: OpportunityRow[]; stats: PipelineStats }) {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<OpportunityRow[]>(initial);
  const [editing, setEditing] = useState<OpportunityRow | null>(null);
  const [stageMenuId, setStageMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"none" | "value" | "name" | "close">("none");
  const [page, setPage] = useState(0);

  // Live-recompute the header tiles from local state so they update right after a stage change.
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

  const tiles = [
    { label: "Open pipeline", value: money(live.openValue), sub: `${live.openCount} open deal${live.openCount === 1 ? "" : "s"}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
    { label: "Won revenue", value: money(live.wonValue), sub: `${live.wonCount} won`, icon: <Trophy className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600" },
    { label: "Win rate", value: `${live.winRate}%`, sub: `${live.wonCount} won · ${live.lostCount} lost`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-indigo-50 text-indigo-600" },
    { label: "Total deals", value: String(rows.length), sub: "in pipeline", icon: <Target className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
  ];

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.company?.toLowerCase().includes(q) ?? false);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "value") return Number(b.deal_value || 0) - Number(a.deal_value || 0);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "close") return new Date(a.expected_close_date || "9999-12-31").getTime() - new Date(b.expected_close_date || "9999-12-31").getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Replaces the old drag-and-drop handler — same optimistic-update-then-revert-on-error
  // pattern, just triggered by picking a stage from a dropdown instead of a drop event.
  async function changeStage(row: OpportunityRow, stage: OpportunityStage) {
    setStageMenuId(null);
    if (row.stage === stage) return;
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, stage } : r)));
    try {
      await moveOpportunityStage(row.id, stage);
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

  return (
    <div>
      <PageHeader title="Opportunities" description="Track deals through your sales pipeline and forecast revenue." />

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
        <Card className="overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              <div className="w-36 sm:w-48 md:w-56 flex-shrink-0">
                <Input
                  leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                  placeholder="Search deals…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs rounded-xl"
                />
              </div>
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 flex-shrink-0">
                <Target className="h-3.5 w-3.5 text-slate-400" />
                <span>{filtered.length}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <div className="relative inline-flex items-center flex-shrink-0">
                <ArrowUpDown className="h-3 w-3 text-slate-400 absolute left-2 pointer-events-none" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="appearance-none rounded-xl border border-slate-200 bg-white pl-6 pr-6 py-1 h-8 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm cursor-pointer"
                >
                  <option value="none">Sort</option>
                  <option value="value">Value High→Low</option>
                  <option value="name">Name A–Z</option>
                  <option value="close">Closing Soonest</option>
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-y-auto max-h-[calc(100vh-260px)] scrollbar-hide">
              <DataTable className="min-w-[800px]">
                <DataTableHead className="sticky top-0 z-10 backdrop-blur-md">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <DataTableTh>Name</DataTableTh>
                    <DataTableTh>Company</DataTableTh>
                    <DataTableTh>Value</DataTableTh>
                    <DataTableTh>Stage</DataTableTh>
                    <DataTableTh>Expected close</DataTableTh>
                    <DataTableTh className="w-20 text-right">Action</DataTableTh>
                  </tr>
                </DataTableHead>
                <DataTableBody className="divide-y divide-slate-100">
                  {paged.length === 0 && (
                    <DataTableEmpty colSpan={6}>No deals match your search.</DataTableEmpty>
                  )}
                  {paged.map((row) => (
                    <DataTableRow key={row.id}>
                      <DataTableTd>
                        <span className="font-medium text-slate-900">{row.name}</span>
                      </DataTableTd>
                      <DataTableTd>
                        {row.company ? (
                          <span className="inline-flex items-center gap-1 text-slate-600 whitespace-nowrap">
                            <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {row.company}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </DataTableTd>
                      <DataTableTd className="font-semibold text-emerald-600 whitespace-nowrap">{money(Number(row.deal_value || 0))}</DataTableTd>
                      <DataTableTd>
                        <div className="relative inline-block">
                          <button onClick={() => setStageMenuId((id) => (id === row.id ? null : row.id))}>
                            <Badge variant={STAGE_BADGE[row.stage]} className="cursor-pointer">
                              {STAGE_LABELS[row.stage]} <ChevronDown className="h-3 w-3" />
                            </Badge>
                          </button>
                          {stageMenuId === row.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setStageMenuId(null)} />
                              <div className="absolute z-50 mt-1 w-48 rounded-xl border border-slate-200 bg-white shadow-xl p-1">
                                {OPPORTUNITY_STAGES.filter((s) => s !== row.stage).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => changeStage(row, s)}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    {STAGE_LABELS[s]}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </DataTableTd>
                      <DataTableTd className="text-slate-500 text-xs whitespace-nowrap">
                        {row.expected_close_date ? new Date(row.expected_close_date).toLocaleDateString() : "—"}
                      </DataTableTd>
                      <DataTableTd className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(row)} aria-label="Edit" className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(row)} aria-label="Delete" className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </DataTableTd>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          </div>

          <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
        </Card>
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
