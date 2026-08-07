import type { ChartType, ReportResultRow, ChartConfig } from "@/lib/analytics-reports";

export interface WidgetConfig {
  chartType: ChartType;
  title: string;
  unit?: "number" | "currency" | "percent";
  color?: string;
  /** Gauge/KPI/target-bar reference value — a second reference value, not the primary metric. */
  gaugeTarget?: number;
  tableColumns?: { key: string; label: string }[];
  /** Leaderboard-style tables (e.g. "Prolific Sales Reps") number each row "1.", "2.", ... */
  showRank?: boolean;
  chartConfig?: ChartConfig;
}

export interface WidgetProps {
  config: WidgetConfig;
  data: ReportResultRow[];
  loading?: boolean;
  error?: string | null;
  onDrillDown?: (row: ReportResultRow) => void;
}
