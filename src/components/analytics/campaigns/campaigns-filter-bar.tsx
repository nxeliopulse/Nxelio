"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampaignsFilters, CampaignsAnalyticsData } from "@/lib/queries/analytics-campaigns";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";
const STATUSES = ["Active", "Paused", "Completed", "Draft"];

export function CampaignsFilterBar({
  filters,
  campaigns,
  data,
}: {
  filters: CampaignsFilters;
  campaigns: { id: string; campaign_name: string }[];
  data: CampaignsAnalyticsData;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    if (pending.status) params.set("status", pending.status);
    if (pending.campaignId) params.set("campaign", pending.campaignId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.status ?? ""} onChange={(e) => setPending({ ...pending, status: e.target.value || undefined })}>
        <option value="">All Statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.campaignId ?? ""} onChange={(e) => setPending({ ...pending, campaignId: e.target.value || undefined })} title="Scope step analytics to one campaign">
        <option value="">Step Analytics: All Campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
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
