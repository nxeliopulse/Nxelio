"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WCard } from "@/components/analytics/WCard";
import { AnyChartRenderer } from "@/components/analytics/widgets/AnyChartRenderer";
import { SystemWidget } from "@/components/analytics/widgets/SystemWidget";
import { ReportBuilderDrawer } from "@/components/analytics/report-builder-drawer";
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

  return (
    <div className="space-y-5 max-w-[1000px] mx-auto pb-10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{report.name}</h1>
          {report.description && <p className="text-xs text-slate-500 mt-0.5">{report.description}</p>}
        </div>
        {!report.systemKey && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
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
    </div>
  );
}
