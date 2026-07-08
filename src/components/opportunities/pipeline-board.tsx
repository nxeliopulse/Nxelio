"use client";
import { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Trophy, Target, GripVertical, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
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
  proposal_sent: "bg-purple-500",
  negotiation: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-red-400",
};

export function PipelineBoard({ initial, stats }: { initial: OpportunityRow[]; stats: PipelineStats }) {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<OpportunityRow[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<OpportunityStage | null>(null);
  const [editing, setEditing] = useState<OpportunityRow | null>(null);

  const byStage = useMemo(() => {
    const map: Record<OpportunityStage, OpportunityRow[]> = {
      new: [], qualified: [], meeting_scheduled: [], proposal_sent: [], negotiation: [], won: [], lost: [],
    };
    for (const r of rows) (map[r.stage] || map.new).push(r);
    return map;
  }, [rows]);

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
    { label: "Win rate", value: `${live.winRate}%`, sub: `${live.wonCount} won · ${live.lostCount} lost`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-purple-50 text-purple-600" },
    { label: "Total deals", value: String(rows.length), sub: "in pipeline", icon: <Target className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
  ];

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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {OPPORTUNITY_STAGES.map((stage) => {
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
