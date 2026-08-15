"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineFilters, PipelineAnalyticsData } from "@/lib/queries/analytics-pipeline";
import { OPPORTUNITY_STAGES, STAGE_LABELS, CLOSED_STAGES } from "@/lib/opportunities";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export function PipelineFilterBar({ filters, showTeamFilter, data }: { filters: PipelineFilters; showTeamFilter: boolean; data: PipelineAnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);
  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s));

  function apply() {
    const params = new URLSearchParams();
    if (pending.stage) params.set("stage", pending.stage);
    if (pending.owner) params.set("owner", pending.owner);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.stage ?? ""} onChange={(e) => setPending({ ...pending, stage: (e.target.value || undefined) as PipelineFilters["stage"] })}>
        <option value="">All Stages</option>
        {openStages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.owner ?? ""} onChange={(e) => setPending({ ...pending, owner: e.target.value || undefined })}>
        <option value="">Owner: Default</option>
        <option value="me">Owner: Me</option>
        {showTeamFilter && <option value="team">Owner: My Team</option>}
        <option value="all">Owner: All (Workspace)</option>
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={apply}>Apply</Button>
      </div>
    </div>
  );
}
