"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ItemCard, type ExplorerItem } from "@/components/analytics/item-card";
import { ItemListRow } from "@/components/analytics/item-list-row";
import { NewDashboardModal } from "@/components/analytics/new-dashboard-modal";
import { ReportBuilderDrawer } from "@/components/analytics/report-builder-drawer";
import type { DashboardSummary } from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition } from "@/lib/analytics-reports";

export function ExplorerView({
  dashboards,
  reports,
  activeType,
  activeFolder,
}: {
  dashboards: DashboardSummary[];
  reports: ReportDefinition[];
  activeType: "dashboard" | "report" | null;
  activeFolder: string | null;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [newDashboardOpen, setNewDashboardOpen] = useState(false);
  const [newReportOpen, setNewReportOpen] = useState(false);

  const items: ExplorerItem[] = useMemo(() => {
    const dashItems: ExplorerItem[] = dashboards.map((d) => ({
      id: d.id,
      kind: "dashboard",
      name: d.name,
      subtitle: d.description || "Dashboard",
      href: `/analytics/dashboards/${d.id}`,
    }));
    const reportItems: ExplorerItem[] = reports.map((r) => ({
      id: r.id!,
      kind: "report",
      name: r.name,
      subtitle: `${r.dataSource} · ${r.chartType}`,
      chartType: r.chartType,
      href: `/analytics/reports/${r.id}`,
    }));
    const all = [...dashItems, ...reportItems];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((i) => i.name.toLowerCase().includes(q));
  }, [dashboards, reports, search]);

  const title = activeType === "dashboard" ? "Dashboards" : activeType === "report" ? "Reports" : "Explorer";

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {activeFolder && <p className="text-xs text-slate-500 mt-0.5">Filtered by category</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <div className="w-48">
            <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setNewReportOpen(true)}>
            <Plus className="h-4 w-4" /> New report
          </Button>
          <Button size="sm" onClick={() => setNewDashboardOpen(true)}>
            <Plus className="h-4 w-4" /> New dashboard
          </Button>
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={cn("p-1.5 rounded-md", viewMode === "grid" ? "bg-white dark:bg-slate-800 shadow-sm" : "text-slate-400")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              aria-label="List view"
              className={cn("p-1.5 rounded-md", viewMode === "list" ? "bg-white dark:bg-slate-800 shadow-sm" : "text-slate-400")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400">No dashboards or reports match yet.</div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <ItemCard key={`${item.kind}-${item.id}`} item={item} onClick={() => router.push(item.href)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#0c0d24]">
          {items.map((item) => (
            <ItemListRow key={`${item.kind}-${item.id}`} item={item} onClick={() => router.push(item.href)} />
          ))}
        </div>
      )}

      <NewDashboardModal open={newDashboardOpen} onClose={() => setNewDashboardOpen(false)} />
      <ReportBuilderDrawer open={newReportOpen} onClose={() => setNewReportOpen(false)} onSaved={() => router.refresh()} />
    </div>
  );
}
