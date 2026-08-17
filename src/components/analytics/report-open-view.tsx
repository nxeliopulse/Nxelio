"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Copy, Trash2, Loader2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WCard } from "@/components/analytics/WCard";
import { AnyChartRenderer } from "@/components/analytics/widgets/AnyChartRenderer";
import { SystemWidget } from "@/components/analytics/widgets/SystemWidget";
import { ReportBuilderDrawer } from "@/components/analytics/report-builder-drawer";
import { ReportScheduleModal } from "@/components/analytics/report-schedule-modal";
import { duplicateReport, deleteReport } from "@/lib/queries/analytics-reports";
import type { ReportDefinition } from "@/lib/analytics-reports";
import type { AnyChartFetchResult } from "@/lib/queries/analytics-chart-data";
import type { SystemWidgetData } from "@/lib/analytics-system-widgets";

export function ReportOpenView({
  report,
  chartData,
  systemData,
}: {
  report: ReportDefinition;
  chartData?: AnyChartFetchResult;
  systemData?: SystemWidgetData;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDuplicate() {
    if (!report.id) return;
    setPending(true);
    try {
      const result = await duplicateReport(report.id);
      if (result) router.push(`/analytics/reports/${result.id}`);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!report.id) return;
    if (!window.confirm(`Delete "${report.name}"? This can't be undone.`)) return;
    setPending(true);
    try {
      const ok = await deleteReport(report.id);
      if (ok) router.push("/analytics/data");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5 max-w-[1000px] mx-auto pb-10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{report.name}</h1>
          {report.description && <p className="text-xs text-slate-500 mt-0.5">{report.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicate
          </Button>
          {!report.systemKey && report.id && (
            <>
              <Button variant="outline" size="sm" onClick={() => setScheduling(true)}>
                <CalendarClock className="h-4 w-4" /> Schedule
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} disabled={pending} className="text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <WCard title={report.name} noPad>
        {report.systemKey && systemData ? (
          <SystemWidget data={systemData} title={report.name} chartType={report.chartType} />
        ) : chartData ? (
          <AnyChartRenderer
            config={{ chartType: report.chartType, title: report.name, chartConfig: report.chartConfig }}
            data={chartData.kind === "standard" ? { kind: "standard", rows: chartData.rows } : chartData}
            quadrantAxisLabels={{ x: report.chartConfig?.quadrantXLabel, y: report.chartConfig?.quadrantYLabel }}
          />
        ) : null}
      </WCard>

      <ReportBuilderDrawer open={editing} onClose={() => setEditing(false)} editReport={report} onSaved={() => router.refresh()} />
      {scheduling && report.id && <ReportScheduleModal reportId={report.id} onClose={() => setScheduling(false)} />}
    </div>
  );
}
