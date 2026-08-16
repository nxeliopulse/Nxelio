"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountsFilters, AccountsAnalyticsData } from "@/lib/queries/analytics-accounts";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export function AccountsFilterBar({ filters, industries, data }: { filters: AccountsFilters; industries: string[]; data: AccountsAnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    if (pending.industry) params.set("industry", pending.industry);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setPending({});
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.industry ?? ""} onChange={(e) => setPending({ ...pending, industry: e.target.value || undefined })}>
        <option value="">All Industries</option>
        {industries.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={apply}>Apply</Button>
        <Button size="sm" variant="outline" onClick={clear}>Clear</Button>
      </div>
    </div>
  );
}
