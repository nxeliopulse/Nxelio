"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Briefcase, Building2, UserCheck, Users2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { moveOpportunityStage } from "@/lib/queries/opportunities";
import { OPPORTUNITY_STAGES, STAGE_LABELS, type OpportunityStage, type OpportunityRow } from "@/lib/opportunities";
import { formatDate, formatDateTime } from "@/lib/utils";

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

export function OpportunityDetailView({ opportunity }: { opportunity: OpportunityRow }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [, startMove] = useTransition();
  const [stage, setStage] = useState(opportunity.stage);

  function handleStageChange(next: OpportunityStage) {
    setStage(next);
    startMove(async () => {
      try {
        await moveOpportunityStage(opportunity.id, next);
        toast("Stage updated.", "success");
        router.refresh();
      } catch {
        toast("Couldn't update stage.", "error");
        setStage(opportunity.stage);
      }
    });
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-10 text-slate-800 dark:text-slate-200">
      <div className="flex items-center justify-between mb-3 px-1">
        <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Opportunities
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-amber-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">Opportunity</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight dark:text-white">{opportunity.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <Badge variant={stageBadgeVariant(stage)}>{STAGE_LABELS[stage]}</Badge>
            <span className="text-lg font-bold text-slate-900 dark:text-white">{money(opportunity.deal_value)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs dark:bg-slate-900 dark:border-slate-800">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 font-bold text-sm text-slate-800 dark:bg-slate-950/40 dark:border-slate-800 dark:text-slate-200">About</div>
            <div className="p-4 grid grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className="block text-slate-500 font-medium mb-0.5 dark:text-slate-400">Stage</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800"
                  value={stage}
                  onChange={(e) => handleStageChange(e.target.value as OpportunityStage)}
                >
                  {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <span className="block text-slate-500 font-medium mb-0.5 dark:text-slate-400">Expected close date</span>
                <span className="font-semibold text-slate-900 dark:text-white">{opportunity.expected_close_date ? formatDate(opportunity.expected_close_date) : "—"}</span>
              </div>
              {opportunity.notes && (
                <div className="col-span-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="block text-slate-500 font-medium mb-0.5 dark:text-slate-400">Notes</span>
                  <span className="text-slate-700 whitespace-pre-wrap dark:text-slate-300">{opportunity.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs dark:bg-slate-900 dark:border-slate-800">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 font-bold text-sm text-slate-800 dark:bg-slate-950/40 dark:border-slate-800 dark:text-slate-200">Related records</div>
            <div className="p-4 space-y-2 text-xs">
              {opportunity.account_id ? (
                <Link href={`/accounts/${opportunity.account_id}`} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-300 dark:border-slate-800 dark:hover:border-blue-500/50 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {opportunity.company || "Account"}
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </Link>
              ) : (
                <p className="text-slate-400 italic dark:text-slate-500">No account linked.</p>
              )}
              {opportunity.contact_id ? (
                <Link href={`/contacts/${opportunity.contact_id}`} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-300 dark:border-slate-800 dark:hover:border-blue-500/50 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <Users2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {opportunity.contact_name || "Contact"}
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </Link>
              ) : (
                <p className="text-slate-400 italic dark:text-slate-500">No contact linked.</p>
              )}
              {opportunity.lead_id ? (
                <Link href={`/leads/${opportunity.lead_id}`} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-300 dark:border-slate-800 dark:hover:border-blue-500/50 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> Originating lead
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </Link>
              ) : (
                <p className="text-slate-400 italic dark:text-slate-500">No originating lead.</p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">Last updated {formatDateTime(opportunity.updated_at)}</p>
        </div>
      </div>
    </div>
  );
}
