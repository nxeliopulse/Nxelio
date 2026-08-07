"use client";
import { useRouter } from "next/navigation";
import { Database, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { REPORT_DATA_SOURCES, type ReportDataSource } from "@/lib/analytics-reports";
import { useAssistant } from "@/components/layout/assistant-context";

export function DataSourcesView({ counts }: { counts: { key: ReportDataSource; count: number }[] }) {
  const router = useRouter();
  const { toggle } = useAssistant();

  return (
    <div className="space-y-5 max-w-[1000px] mx-auto pb-10">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Data</h1>
        <p className="text-xs text-slate-500 mt-0.5">The CRM objects available to build reports and dashboards from.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {counts.map(({ key, count }) => (
          <Card key={key} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <Database className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-sm text-slate-900 dark:text-white">{REPORT_DATA_SOURCES[key].label}</p>
                <p className="text-xs text-slate-400">{count.toLocaleString()} rows</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm text-slate-900 dark:text-white">Not sure where to start?</p>
          <p className="text-xs text-slate-500 mt-0.5">Ask the AI Assistant to help you build a report.</p>
        </div>
        <button onClick={() => { router.push("/analytics"); toggle(); }} className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
          Ask Assistant <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </Card>
    </div>
  );
}
