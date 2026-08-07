import { Widget } from "./Widget";
import { ComparatorWidget } from "./ComparatorWidget";
import { QuadrantWidget } from "./QuadrantWidget";
import { CohortWidget } from "./CohortWidget";
import type { ComparatorResult, CohortResult, QuadrantResult, ReportResultRow } from "@/lib/analytics-reports";
import type { WidgetConfig } from "./shared/types";

/** Comparator/Quadrant/Cohort have result shapes the standard
 *  metric+groupBy ReportResultRow[] contract can't represent (multi-metric
 *  period pairs, raw x/y points, a cohort x breakdown matrix) — this tagged
 *  union lets one component dispatch across both worlds, used everywhere a
 *  chart is rendered (dashboard widgets, an opened report, the builder's
 *  live preview) instead of duplicating the branch three times. The "which
 *  kind does this chart type need" mapping (chartKindFor) lives in
 *  src/lib/analytics-reports.ts instead of here, so server-only query code
 *  can use it without pulling this client-rendering file's recharts imports
 *  into a server bundle. */
export type AnyChartData =
  | { kind: "standard"; rows: ReportResultRow[] }
  | { kind: "comparator"; result: ComparatorResult }
  | { kind: "quadrant"; result: QuadrantResult }
  | { kind: "cohort"; result: CohortResult };

export function AnyChartRenderer({
  config,
  data,
  quadrantAxisLabels,
}: {
  config: WidgetConfig;
  data: AnyChartData;
  /** Quadrant only — the X/Y axis labels, sourced from the report's chart_config. */
  quadrantAxisLabels?: { x?: string; y?: string };
}) {
  switch (data.kind) {
    case "comparator":
      return <ComparatorWidget config={config} result={data.result} />;
    case "quadrant":
      return <QuadrantWidget result={data.result} xLabel={quadrantAxisLabels?.x} yLabel={quadrantAxisLabels?.y} />;
    case "cohort":
      return <CohortWidget result={data.result} />;
    case "standard":
      return <Widget config={config} data={data.rows} />;
  }
}
