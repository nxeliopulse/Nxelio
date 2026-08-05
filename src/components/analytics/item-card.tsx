import {
  LayoutDashboard, FileText, BarChart2, PieChart, TrendingUp, Table2, GitBranch, Gauge, Target,
  Rows3, Grid3x3, MapPin, Layers, BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ChartType } from "@/lib/analytics-reports";

const CHART_ICON: Record<ChartType, React.ReactNode> = {
  kpi: <Gauge className="h-4 w-4" />,
  bar: <BarChart2 className="h-4 w-4" />,
  column: <BarChart2 className="h-4 w-4" />,
  line: <TrendingUp className="h-4 w-4" />,
  area: <TrendingUp className="h-4 w-4" />,
  donut: <PieChart className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
  funnel: <GitBranch className="h-4 w-4" />,
  gauge: <Gauge className="h-4 w-4" />,
  target: <Target className="h-4 w-4" />,
  zone: <MapPin className="h-4 w-4" />,
  stage: <Layers className="h-4 w-4" />,
  waterfall: <BarChart3 className="h-4 w-4" />,
  anomaly: <TrendingUp className="h-4 w-4" />,
  comparator: <Rows3 className="h-4 w-4" />,
  quadrant: <Grid3x3 className="h-4 w-4" />,
  cohort: <Grid3x3 className="h-4 w-4" />,
  heatmap: <BarChart2 className="h-4 w-4" />,
  radar: <BarChart2 className="h-4 w-4" />,
  scatter: <BarChart2 className="h-4 w-4" />,
};

export interface ExplorerItem {
  id: string;
  kind: "dashboard" | "report";
  name: string;
  subtitle: string;
  chartType?: ChartType;
  href: string;
}

export function ItemCard({ item, onClick }: { item: ExplorerItem; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2.5">
        <span className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.kind === "dashboard" ? "bg-blue-50 text-blue-600" : "bg-teal-50 text-teal-600"}`}>
          {item.kind === "dashboard" ? <LayoutDashboard className="h-4 w-4" /> : item.chartType ? CHART_ICON[item.chartType] : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.name}</p>
          <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
        </div>
      </div>
    </Card>
  );
}
