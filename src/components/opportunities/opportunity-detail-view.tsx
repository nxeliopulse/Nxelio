"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Crown, Building2, UserCheck, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { moveOpportunityStage, updateOpportunity } from "@/lib/queries/opportunities";
import { OPPORTUNITY_STAGES, STAGE_LABELS, getStageForecast, type OpportunityStage, type OpportunityRow } from "@/lib/opportunities";
import type { AccountRow } from "@/lib/queries/accounts";
import { formatDateTime } from "@/lib/utils";
import {
  RecordHeader, StatusBadge, StageProgress, DetailCard, InfoGrid, FieldRow,
  RelatedRecordsCard, FieldRenderer, type RelatedRecordItem,
} from "@/components/records";
import type { FieldDefinition } from "@/core/engine/types";

/** Description comes from the same rich-text editor used for notes elsewhere
 *  (add-deal-modal.tsx) — it's stored as HTML, so it must be sanitized and
 *  rendered as HTML rather than escaped plain text, or literal tags show up
 *  on screen. */
const NOTES_SANITIZE_OPTS = { ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "span", "h1", "h2", "h3"], ALLOWED_ATTR: ["href", "target", "rel", "style"] };
function safeNotesHtml(html: string): string {
  return DOMPurify.sanitize(html, NOTES_SANITIZE_OPTS);
}

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

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

// The linear pipeline shown in the progress bar — "lost" is a terminal branch
// off this line, not a step on it, so it's handled as its own banner instead.
const PIPELINE_STAGES = OPPORTUNITY_STAGES.filter((s) => s !== "lost");

const stageOptions = OPPORTUNITY_STAGES.map((s) => ({ label: STAGE_LABELS[s], value: s, variant: stageBadgeVariant(s) }));
const stageFieldDef: FieldDefinition = { name: "stage_label", label: "Stage", type: "badge", options: stageOptions };
const dateFieldDef: FieldDefinition = { name: "expected_close_date", label: "Close Date", type: "date" };
const employeesFieldDef: FieldDefinition = { name: "employees", label: "Company Size", type: "number" };

export function OpportunityDetailView({
  opportunity,
  account,
  ownerName,
  leadSource,
  prevId,
  nextId,
}: {
  opportunity: OpportunityRow;
  account: AccountRow | null;
  ownerName: string | null;
  leadSource: string | null;
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [, startMove] = useTransition();
  const [stage, setStage] = useState(opportunity.stage);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    dealValue: String(opportunity.deal_value),
    expectedCloseDate: opportunity.expected_close_date || "",
    notes: opportunity.notes || "",
  });

  function handleStageChange(next: string) {
    const nextStage = next as OpportunityStage;
    setStage(nextStage);
    startMove(async () => {
      try {
        await moveOpportunityStage(opportunity.id, nextStage);
        toast("Stage updated.", "success");
        router.refresh();
      } catch {
        toast("Couldn't update stage.", "error");
        setStage(opportunity.stage);
      }
    });
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await updateOpportunity(opportunity.id, {
        dealValue: Number(draft.dealValue) || 0,
        expectedCloseDate: draft.expectedCloseDate || null,
        notes: draft.notes.trim() || null,
      });
      toast("Opportunity updated.", "success");
      setEditing(false);
      router.refresh();
    } catch {
      toast("Couldn't save changes.", "error");
    } finally {
      setSaving(false);
    }
  }

  const isClosed = !!opportunity.closed_at;
  const forecast = getStageForecast(stage);
  const weightedValue = opportunity.deal_value * (forecast.probability / 100);

  const accountName = opportunity.company || account?.account_name || null;
  const location = account
    ? [account.billing_city, account.billing_state, account.billing_country].filter(Boolean).join(", ") || null
    : null;

  const relatedItems: RelatedRecordItem[] = [
    { key: "account", icon: <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />, label: accountName || "Account", href: opportunity.account_id ? `/accounts/${opportunity.account_id}` : null, emptyText: "No account linked." },
    { key: "contact", icon: <Users2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />, label: opportunity.contact_name || "Contact", href: opportunity.contact_id ? `/contacts/${opportunity.contact_id}` : null, emptyText: "No contact linked." },
    { key: "lead", icon: <UserCheck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />, label: "Originating lead", href: opportunity.lead_id ? `/leads/${opportunity.lead_id}` : null, emptyText: "No originating lead." },
  ];

  return (
    <div className="max-w-[1400px] mx-auto pb-10 text-slate-800 dark:text-slate-700">
      <RecordHeader
        breadcrumbHref="/opportunities"
        breadcrumbLabel="Opportunities"
        icon={<Crown className="h-6 w-6" />}
        iconClassName="bg-amber-500"
        eyebrow="Opportunity"
        title={opportunity.name}
        badges={
          <>
            <StatusBadge label={isClosed ? "Closed" : "Open"} tone={isClosed ? "neutral" : "open"} />
            <Badge variant={stageBadgeVariant(stage)}>{STAGE_LABELS[stage]}</Badge>
          </>
        }
        headline={<span className="text-lg font-bold text-slate-900 dark:text-white">{money(opportunity.deal_value)}</span>}
        onPrev={prevId ? () => router.push(`/opportunities/${prevId}`) : undefined}
        onNext={nextId ? () => router.push(`/opportunities/${nextId}`) : undefined}
        onEdit={() => setEditing((e) => !e)}
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
        <InfoGrid className="md:grid-cols-4 mb-4">
          <FieldRow label="Account" value={accountName} />
          <FieldRow label="Amount" value={money(opportunity.deal_value)} />
          <FieldRow label="Close Date" value={<FieldRenderer definition={dateFieldDef} value={opportunity.expected_close_date} />} />
          <FieldRow label="Probability" value={`${forecast.probability}%`} />
        </InfoGrid>
        {stage === "lost" ? (
          <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">This opportunity was marked Lost.</p>
        ) : (
          <StageProgress
            steps={PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            currentValue={stage}
            onSelect={handleStageChange}
          />
        )}
      </div>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <DetailCard title="Opportunity Information" collapsible>
            {editing ? (
              <div className="space-y-3">
                <InfoGrid>
                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1 dark:text-slate-500">Amount</label>
                    <Input type="number" value={draft.dealValue} onChange={(e) => setDraft((d) => ({ ...d, dealValue: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1 dark:text-slate-500">Close Date</label>
                    <Input type="date" value={draft.expectedCloseDate} onChange={(e) => setDraft((d) => ({ ...d, expectedCloseDate: e.target.value }))} />
                  </div>
                </InfoGrid>
                <div>
                  <label className="block text-xs text-slate-500 font-medium mb-1 dark:text-slate-500">Description</label>
                  <Textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={4} />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(false); setDraft({ dealValue: String(opportunity.deal_value), expectedCloseDate: opportunity.expected_close_date || "", notes: opportunity.notes || "" }); }}>Cancel</Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                </div>
              </div>
            ) : (
              <InfoGrid>
                <FieldRow label="Opportunity Name" value={opportunity.name} />
                <FieldRow label="Account" value={accountName} />
                <FieldRow label="Primary Contact" value={opportunity.contact_name} />
                <FieldRow label="Amount" value={money(opportunity.deal_value)} />
                <FieldRow label="Close Date" value={<FieldRenderer definition={dateFieldDef} value={opportunity.expected_close_date} />} />
                <FieldRow label="Stage" value={<FieldRenderer definition={stageFieldDef} value={stage} />} />
                <FieldRow label="Probability" value={`${forecast.probability}%`} />
                <FieldRow label="Opportunity Owner" value={ownerName} />
                <FieldRow label="Source" value={leadSource} />
                <FieldRow label="Forecast Category" value={forecast.forecastCategory} />
                <FieldRow label="Expected Revenue" value={money(weightedValue)} />
                <FieldRow label="Industry" value={account?.industry || null} />
                <FieldRow label="Company Size" value={account?.employees ? <FieldRenderer definition={employeesFieldDef} value={account.employees} /> : null} />
                <FieldRow label="Location" value={location} />
                <FieldRow label="Deal Source" value={opportunity.source} />
                <FieldRow label="Priority" value={opportunity.priority} />
                <FieldRow label="Tags" value={opportunity.tags} />
                <FieldRow label="Project" value={opportunity.projects} />
                <FieldRow label="Follow Up Date" value={opportunity.follow_up_date ? <FieldRenderer definition={dateFieldDef} value={opportunity.follow_up_date} /> : null} />
                <FieldRow
                  label="Description"
                  value={opportunity.notes ? <div className="[&_p]:my-0 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeNotesHtml(opportunity.notes) }} /> : null}
                  className="md:col-span-2"
                />
              </InfoGrid>
            )}
          </DetailCard>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <RelatedRecordsCard title="Related Records" items={relatedItems} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">Last updated {formatDateTime(opportunity.updated_at)}</p>
        </div>
      </div>
    </div>
  );
}
