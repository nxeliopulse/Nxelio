"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings2, Plus, Check, RefreshCw, ChevronDown, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WCard } from "@/components/analytics/WCard";
import { AnyChartRenderer } from "@/components/analytics/widgets/AnyChartRenderer";
import { SystemWidget } from "@/components/analytics/widgets/SystemWidget";
import {
  updateWidgetLayout,
  removeWidget,
  listDashboards,
  type DashboardWithWidgets,
  type DashboardWidget,
  type DashboardSummary,
} from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition, ChartType } from "@/lib/analytics-reports";
import type { AnyChartFetchResult } from "@/lib/queries/analytics-chart-data";
import type { SystemWidgetData } from "@/lib/analytics-system-widgets";
import { ReportBuilderDrawer } from "@/components/analytics/report-builder-drawer";
import { AddComponentModal } from "@/components/analytics/add-component-modal";
import { NewDashboardModal } from "@/components/analytics/new-dashboard-modal";

export interface ResolvedWidget {
  widget: DashboardWidget;
  report: ReportDefinition;
  chartData?: AnyChartFetchResult;
  systemData?: SystemWidgetData;
}

export function DashboardOpenView({ dashboard, resolvedWidgets }: { dashboard: DashboardWithWidgets; resolvedWidgets: ResolvedWidget[] }) {
  const router = useRouter();
  const [customizing, setCustomizing] = useState(false);
  const [items, setItems] = useState(resolvedWidgets);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderChartType, setBuilderChartType] = useState<ChartType | undefined>(undefined);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [newDashboardOpen, setNewDashboardOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [allDashboards, setAllDashboards] = useState<DashboardSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    listDashboards().then(setAllDashboards);
  }, []);

  useEffect(() => {
    setItems(resolvedWidgets);
  }, [resolvedWidgets]);

  async function persistOrder(next: ResolvedWidget[]) {
    setItems(next);
    await Promise.all(next.map((r, i) => updateWidgetLayout(r.widget.id, { sortOrder: i })));
    router.refresh();
  }

  function onDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setDragIdx(null);
    void persistOrder(next);
  }

  async function onRemove(widgetId: string) {
    await removeWidget(widgetId);
    setItems((cur) => cur.filter((r) => r.widget.id !== widgetId));
    router.refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setSwitcherOpen((s) => !s)}
            className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white hover:text-[var(--primary)]"
          >
            {dashboard.name}
            <ChevronDown className="h-5 w-5 text-slate-400" />
          </button>
          {switcherOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg z-20 py-1">
              {allDashboards.map((d) => (
                <Link
                  key={d.id}
                  href={`/analytics/dashboards/${d.id}`}
                  onClick={() => setSwitcherOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800",
                    d.id === dashboard.id ? "font-semibold text-[var(--primary)]" : "text-slate-600 dark:text-slate-300"
                  )}
                >
                  <LayoutDashboard className="h-3.5 w-3.5 flex-shrink-0" />
                  {d.name}
                </Link>
              ))}
              <Link href="/analytics?type=dashboard" onClick={() => setSwitcherOpen(false)} className="block px-3 py-2 text-xs font-semibold text-slate-400 border-t border-slate-100 dark:border-slate-800 mt-1">
                Manage dashboards
              </Link>
            </div>
          )}
          {dashboard.description && <p className="text-xs text-slate-500 mt-0.5">{dashboard.description}</p>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleRefresh} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900" aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
          <Button variant="outline" size="sm" onClick={() => setAddComponentOpen(true)}>
            <Plus className="h-4 w-4" /> Add Component
          </Button>
          <Button size="sm" onClick={() => setNewDashboardOpen(true)}>
            Create Dashboard
          </Button>
          <Button variant={customizing ? "primary" : "outline"} size="sm" onClick={() => setCustomizing((c) => !c)}>
            {customizing ? <Check className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            {customizing ? "Done" : "Customize"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400">
          No components on this dashboard yet.{" "}
          <button className="text-[var(--primary)] font-semibold" onClick={() => setAddComponentOpen(true)}>
            Add your first one
          </button>
          .
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {items.map((r, i) => (
            <div key={r.widget.id} className={cn("col-span-12 min-w-0", r.widget.width <= 6 && "md:col-span-6", r.widget.width >= 12 && "md:col-span-12")}>
              <WCard
                title={r.widget.titleOverride ?? r.report.name}
                customizing={customizing}
                dragging={dragIdx === i}
                onDragStart={() => setDragIdx(i)}
                onDrop={() => onDrop(i)}
                onDragEnd={() => setDragIdx(null)}
                onRemove={() => onRemove(r.widget.id)}
                noPad
              >
                {r.report.systemKey && r.systemData ? (
                  <SystemWidget data={r.systemData} title={r.report.name} chartType={r.report.chartType} />
                ) : r.chartData ? (
                  <AnyChartRenderer
                    config={{ chartType: r.report.chartType, title: r.report.name, chartConfig: r.report.chartConfig }}
                    data={r.chartData.kind === "standard" ? { kind: "standard", rows: r.chartData.rows } : r.chartData}
                    quadrantAxisLabels={{ x: r.report.chartConfig?.quadrantXLabel, y: r.report.chartConfig?.quadrantYLabel }}
                  />
                ) : null}
              </WCard>
            </div>
          ))}
        </div>
      )}

      <AddComponentModal
        open={addComponentOpen}
        onClose={() => setAddComponentOpen(false)}
        onPickChartType={(ct) => {
          setBuilderChartType(ct);
          setBuilderOpen(true);
        }}
        dashboardId={dashboard.id}
        nextSortOrder={items.length}
        onAttached={() => router.refresh()}
      />

      <ReportBuilderDrawer
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        attachToDashboardId={dashboard.id}
        nextSortOrder={items.length}
        initialChartType={builderChartType}
        onSaved={() => router.refresh()}
      />

      <NewDashboardModal open={newDashboardOpen} onClose={() => setNewDashboardOpen(false)} />
    </div>
  );
}
