"use client";
import { useEffect, useState } from "react";
import {
  BarChart2,
  Gauge as GaugeIcon,
  Target,
  GitBranch,
  Rows3,
  TrendingUp,
  Grid3x3,
  LayoutGrid,
  MapPin,
  Layers,
  BarChart3,
  FolderOpen,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { listReports } from "@/lib/queries/analytics-reports";
import { addWidgetToDashboard } from "@/lib/queries/analytics-dashboards";
import type { ChartType, ReportDefinition } from "@/lib/analytics-reports";

interface ComponentType {
  key: string;
  label: string;
  icon: React.ReactNode;
  chartType?: ChartType;
  working: boolean;
}

const COMPONENT_TYPES: ComponentType[] = [
  { key: "chart", label: "Chart", icon: <BarChart2 className="h-5 w-5" />, chartType: "bar", working: true },
  { key: "kpi", label: "KPI", icon: <GaugeIcon className="h-5 w-5" />, chartType: "kpi", working: true },
  { key: "comparator", label: "Comparator", icon: <Rows3 className="h-5 w-5" />, chartType: "comparator", working: true },
  { key: "anomaly", label: "Anomaly Detection", icon: <TrendingUp className="h-5 w-5" />, chartType: "anomaly", working: true },
  { key: "target", label: "Target Meter", icon: <Target className="h-5 w-5" />, chartType: "gauge", working: true },
  { key: "funnel", label: "Funnel", icon: <GitBranch className="h-5 w-5" />, chartType: "funnel", working: true },
  { key: "cohort", label: "Cohort", icon: <Grid3x3 className="h-5 w-5" />, chartType: "cohort", working: true },
  { key: "quadrant", label: "Quadrant", icon: <LayoutGrid className="h-5 w-5" />, chartType: "quadrant", working: true },
  { key: "zone", label: "Zone", icon: <MapPin className="h-5 w-5" />, chartType: "zone", working: true },
  { key: "stage", label: "Stage", icon: <Layers className="h-5 w-5" />, chartType: "stage", working: true },
  { key: "waterfall", label: "Waterfall", icon: <BarChart3 className="h-5 w-5" />, chartType: "waterfall", working: true },
];

export function AddComponentModal({
  open,
  onClose,
  onPickChartType,
  dashboardId,
  nextSortOrder,
  onAttached,
}: {
  open: boolean;
  onClose: () => void;
  onPickChartType: (chartType: ChartType) => void;
  dashboardId: string;
  nextSortOrder: number;
  onAttached: () => void;
}) {
  const { toast } = useFeedback();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reports, setReports] = useState<ReportDefinition[]>([]);

  useEffect(() => {
    if (!galleryOpen) return;
    listReports().then(setReports);
  }, [galleryOpen]);

  function handlePick(ct: ComponentType) {
    if (!ct.working || !ct.chartType) {
      toast(`${ct.label} isn't built yet — coming in a later update.`, "info");
      return;
    }
    onClose();
    onPickChartType(ct.chartType);
  }

  async function handleAttachExisting(report: ReportDefinition) {
    await addWidgetToDashboard(dashboardId, report.id!, { width: 6, height: 4, sortOrder: nextSortOrder });
    setGalleryOpen(false);
    onClose();
    onAttached();
  }

  if (galleryOpen) {
    return (
      <Modal open={open} onClose={onClose} title="Pick from gallery" description="Attach one of your existing saved reports to this dashboard." size="sm">
        <div className="max-h-80 overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
          {reports.length === 0 && <p className="p-5 text-sm text-slate-400 text-center">No saved reports yet.</p>}
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => handleAttachExisting(r)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {r.name}
              <span className="ml-2 text-xs text-slate-400">{r.dataSource} · {r.chartType}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Component" size="md">
      <div className="p-5 grid grid-cols-2 gap-3">
        {COMPONENT_TYPES.map((ct) => (
          <button
            key={ct.key}
            onClick={() => handlePick(ct)}
            className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors ${
              ct.working
                ? "border-slate-200 dark:border-slate-800 hover:border-[var(--primary)] hover:bg-slate-50 dark:hover:bg-slate-900/40"
                : "border-slate-100 dark:border-slate-800/60 opacity-50"
            }`}
          >
            <span className="text-slate-500">{ct.icon}</span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{ct.label}</span>
            {!ct.working && <span className="absolute top-1.5 right-2 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">Soon</span>}
          </button>
        ))}
        <button
          onClick={() => setGalleryOpen(true)}
          className="col-span-2 flex items-center gap-3 px-4 py-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-left hover:border-[var(--primary)] hover:bg-slate-50 dark:hover:bg-slate-900/40"
        >
          <span className="text-slate-500">
            <FolderOpen className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pick from gallery</span>
        </button>
      </div>
    </Modal>
  );
}
