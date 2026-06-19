"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createOpportunityFromLead } from "@/lib/queries/opportunities";
import { OPPORTUNITY_STAGES, STAGE_LABELS, type OpportunityStage } from "@/lib/opportunities";
import type { LeadRow } from "@/lib/queries/leads";

export function ConvertOpportunityModal({
  open, onClose, lead, onConverted,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadRow;
  onConverted: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const defaultName = lead.company_name ? `${lead.company_name} deal` : `${lead.full_name || "New"} deal`;
  const [name, setName] = useState(defaultName);
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<OpportunityStage>("new");
  const [closeDate, setCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function convert() {
    setSaving(true);
    try {
      await createOpportunityFromLead({
        leadId: lead.id,
        name: name.trim() || defaultName,
        company: lead.company_name,
        contactName: lead.full_name,
        contactEmail: lead.email,
        dealValue: parseFloat(value) || 0,
        stage,
        expectedCloseDate: closeDate || null,
        notes: notes.trim() || null,
      });
      toast("Lead converted to opportunity.", "success");
      onConverted();
      router.refresh();
    } catch {
      toast("Conversion failed. Try again.", "error");
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Modal open={open} onClose={onClose} title="Convert to Opportunity" description="Create a pipeline deal from this lead" size="md">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 p-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{lead.full_name || lead.company_name}</p>
            <p className="text-xs text-slate-500 truncate">{lead.company_name || "—"} · {lead.email || "no email"}</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Deal name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Deal value ($)</label>
            <input type="number" min="0" placeholder="0" className={field} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Stage</label>
            <select className={field} value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
              {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Expected close date</label>
          <input type="date" className={field} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
          <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={convert} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Convert
        </Button>
      </div>
    </Modal>
  );
}
