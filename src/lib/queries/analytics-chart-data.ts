"use server";
import { chartKindFor, type ReportDefinition } from "@/lib/analytics-reports";
import { runReport, runComparator, runQuadrant, runCohort } from "./analytics-reports";

// Mirrors the client-side AnyChartData union (src/components/analytics/widgets/AnyChartRenderer.tsx)
// but as plain data, so both dashboard/report pages can fetch the right
// shape per chart type without duplicating the dispatch logic.
export type AnyChartFetchResult =
  | { kind: "standard"; rows: Awaited<ReturnType<typeof runReport>>["rows"] }
  | { kind: "comparator"; result: Awaited<ReturnType<typeof runComparator>> }
  | { kind: "quadrant"; result: Awaited<ReturnType<typeof runQuadrant>> }
  | { kind: "cohort"; result: Awaited<ReturnType<typeof runCohort>> };

export async function fetchChartData(report: ReportDefinition): Promise<AnyChartFetchResult> {
  const kind = chartKindFor(report.chartType);
  if (kind === "comparator") return { kind, result: await runComparator(report) };
  if (kind === "quadrant") return { kind, result: await runQuadrant(report) };
  if (kind === "cohort") return { kind, result: await runCohort(report) };
  const result = await runReport(report);
  return { kind: "standard", rows: result.rows };
}
