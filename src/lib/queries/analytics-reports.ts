"use server";
import { createClient } from "@/lib/supabase/server";
import {
  REPORT_DATA_SOURCES,
  type ReportDefinition,
  type ReportResult,
  type ReportResultRow,
  type FilterCondition,
  type MetricDefinition,
  type ComparatorResult,
  type QuadrantResult,
  type CohortResult,
} from "@/lib/analytics-reports";

const REPORT_COLUMNS = "id, folder_id, name, description, data_source, metric, group_by, group_by_interval, filters, chart_type, chart_config, system_key";

interface ReportRow {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  data_source: ReportDefinition["dataSource"];
  metric: ReportDefinition["metric"];
  group_by: string | null;
  group_by_interval: ReportDefinition["groupByInterval"];
  filters: FilterCondition[];
  chart_type: ReportDefinition["chartType"];
  chart_config: ReportDefinition["chartConfig"];
  system_key: string | null;
}

function rowToDefinition(r: ReportRow): ReportDefinition {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    description: r.description,
    dataSource: r.data_source,
    metric: r.metric,
    groupBy: r.group_by,
    groupByInterval: r.group_by_interval,
    filters: r.filters ?? [],
    chartType: r.chart_type,
    chartConfig: r.chart_config ?? {},
    systemKey: r.system_key,
  };
}

/** Pushes a report's filters down as real Supabase query methods — this is
 *  the actual fix for the old Analytics page's client-side number scaling.
 *  Any field not in REPORT_DATA_SOURCES[...].fields is silently dropped
 *  before it can reach the database: this whitelist is the security
 *  boundary, there is never raw caller-supplied SQL/column names here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, dataSource: ReportDefinition["dataSource"], filters: FilterCondition[]) {
  const allowed = new Set(REPORT_DATA_SOURCES[dataSource].fields.filter((f) => f.filterable).map((f) => f.key));
  for (const f of filters) {
    if (!allowed.has(f.field)) continue;
    switch (f.operator) {
      case "eq":
        query = query.eq(f.field, f.value);
        break;
      case "in":
        query = query.in(f.field, f.value as string[]);
        break;
      case "date_range": {
        const v = f.value as { start: string; end: string };
        query = query.gte(f.field, v.start).lte(f.field, v.end);
        break;
      }
      case "gt":
        query = query.gt(f.field, f.value);
        break;
      case "lt":
        query = query.lt(f.field, f.value);
        break;
    }
  }
  return query;
}

function bucketKey(raw: unknown, interval: ReportDefinition["groupByInterval"]): string {
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return "Unknown";
  if (interval === "year") return String(d.getFullYear());
  if (interval === "month") return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  if (interval === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10); // day
}

/** Same bucketing/aggregation style already used throughout analytics.ts
 *  (leadGrowth/revenueSeries/pipelineBuckets etc.) — parameterized instead
 *  of hardcoded per chart, applied to the small, already-filtered row set
 *  Supabase just returned. */
function aggregate(
  rows: Record<string, unknown>[],
  def: Pick<ReportDefinition, "metric" | "groupBy" | "groupByInterval">,
  groupBy: string | null,
  metricCol: string | null
): ReportResult {
  const valueOf = (row: Record<string, unknown>): number => {
    if (def.metric.type === "count") return 1;
    const raw = metricCol ? row[metricCol] : null;
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  if (!groupBy) {
    const total = rows.reduce((sum, r) => sum + valueOf(r), 0);
    const value = def.metric.type === "avg" ? (rows.length ? total / rows.length : 0) : total;
    return {
      rows: [{ label: "Total", value: Math.round(value * 100) / 100 }],
      total: rows.length,
      generatedAt: new Date().toISOString(),
    };
  }

  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const rawKey = def.groupByInterval ? bucketKey(row[groupBy], def.groupByInterval) : String(row[groupBy] ?? "Unknown");
    const cur = buckets.get(rawKey) ?? { sum: 0, count: 0 };
    cur.sum += valueOf(row);
    cur.count += 1;
    buckets.set(rawKey, cur);
  }

  const resultRows: ReportResultRow[] = Array.from(buckets.entries()).map(([label, b]) => ({
    label,
    value: Math.round((def.metric.type === "avg" ? b.sum / b.count : b.sum) * 100) / 100,
  }));

  return { rows: resultRows, total: rows.length, generatedAt: new Date().toISOString() };
}

async function execute(def: ReportDefinition): Promise<ReportResult> {
  const meta = REPORT_DATA_SOURCES[def.dataSource];
  const groupBy = def.groupBy && meta.fields.some((f) => f.key === def.groupBy && f.groupable) ? def.groupBy : null;
  const metricColumn = def.metric.type !== "count" ? def.metric.column : null;
  const metricCol = metricColumn && meta.fields.some((f) => f.key === metricColumn && f.sumable) ? metricColumn : null;

  const supabase = await createClient();
  const cols = Array.from(new Set([groupBy, metricCol, "id"].filter(Boolean) as string[])).join(",");
  let query = supabase.from(meta.table).select(cols);
  query = applyFilters(query, def.dataSource, def.filters);
  const { data, error } = await query;
  if (error) {
    console.error(`[analytics-reports] execute failed for ${def.dataSource}:`, error.message);
    return { rows: [], total: 0, generatedAt: new Date().toISOString() };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return aggregate(rows, def, groupBy, metricCol);
}

/** Runs a saved report definition against real Supabase tables. */
export async function runReport(def: ReportDefinition): Promise<ReportResult> {
  return execute(def);
}

/** Same execution path, used by the builder's live-preview panel before a
 *  report is saved — no persistence side effect. */
export async function previewReport(def: ReportDefinition): Promise<ReportResult> {
  return execute(def);
}

// ============================================================================
// Comparator — one or more metrics, each totaled over the current vs. the
// previous period (month/quarter/year). Runs 2 real queries per metric
// (one per date range); everything else (filters, data source whitelist)
// goes through the same applyFilters() security boundary as the standard
// engine above.
// ============================================================================
function periodRanges(period: "month" | "quarter" | "year", now: Date): { current: [Date, Date]; previous: [Date, Date]; labels: [string, string] } {
  if (period === "year") {
    const y = now.getFullYear();
    const curStart = new Date(y, 0, 1);
    const prevStart = new Date(y - 1, 0, 1);
    return { current: [curStart, now], previous: [prevStart, curStart], labels: [String(y), String(y - 1)] };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const curStart = new Date(now.getFullYear(), q * 3, 1);
    const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const label = (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    return { current: [curStart, now], previous: [prevStart, curStart], labels: [label(curStart), label(prevStart)] };
  }
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const label = (d: Date) => d.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { current: [curStart, now], previous: [prevStart, curStart], labels: [label(curStart), label(prevStart)] };
}

async function comparatorTotalFor(def: ReportDefinition, metric: MetricDefinition, range: [Date, Date]): Promise<number> {
  const meta = REPORT_DATA_SOURCES[def.dataSource];
  const metricColumn = metric.type !== "count" ? metric.column : null;
  const metricCol = metricColumn && meta.fields.some((f) => f.key === metricColumn && f.sumable) ? metricColumn : null;

  const supabase = await createClient();
  const cols = Array.from(new Set([metricCol, "id"].filter(Boolean) as string[])).join(",");
  let query = supabase
    .from(meta.table)
    .select(cols)
    .gte(meta.defaultDateField, range[0].toISOString())
    .lt(meta.defaultDateField, range[1].toISOString());
  query = applyFilters(query, def.dataSource, def.filters);
  const { data, error } = await query;
  if (error) {
    console.error(`[analytics-reports] comparator query failed for ${def.dataSource}:`, error.message);
    return 0;
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (metric.type === "count") return rows.length;
  const sum = rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[metricCol!] ?? 0), 0);
  return metric.type === "avg" ? (rows.length ? sum / rows.length : 0) : sum;
}

async function executeComparator(def: ReportDefinition): Promise<ComparatorResult> {
  const period = def.chartConfig?.comparatorPeriod ?? "month";
  const metrics = def.chartConfig?.comparatorMetrics ?? [];
  const { current, previous, labels } = periodRanges(period, new Date());

  const rows = await Promise.all(
    metrics.map(async (m) => ({
      label: m.label,
      current: Math.round((await comparatorTotalFor(def, m.metric, current)) * 100) / 100,
      previous: Math.round((await comparatorTotalFor(def, m.metric, previous)) * 100) / 100,
    }))
  );

  return { periodLabels: labels, rows };
}

export async function runComparator(def: ReportDefinition): Promise<ComparatorResult> {
  return executeComparator(def);
}
export async function previewComparator(def: ReportDefinition): Promise<ComparatorResult> {
  return executeComparator(def);
}

// ============================================================================
// Quadrant — raw per-record points (not aggregated) for two numeric columns,
// split into 4 quadrants at the median of each axis.
// ============================================================================
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function executeQuadrant(def: ReportDefinition): Promise<QuadrantResult> {
  if (def.metric.type === "count") return { points: [], xMedian: 0, yMedian: 0 };
  const xCol = def.metric.column;
  const yCol = def.chartConfig?.quadrantYColumn;
  const meta = REPORT_DATA_SOURCES[def.dataSource];
  if (!yCol || !meta.fields.some((f) => f.key === xCol && f.sumable) || !meta.fields.some((f) => f.key === yCol && f.sumable)) {
    return { points: [], xMedian: 0, yMedian: 0 };
  }
  const labelField = meta.fields.find((f) => f.type === "text" && f.groupable)?.key;

  const supabase = await createClient();
  const cols = Array.from(new Set([xCol, yCol, labelField, "id"].filter(Boolean) as string[])).join(",");
  let query = supabase.from(meta.table).select(cols).limit(500);
  query = applyFilters(query, def.dataSource, def.filters);
  const { data, error } = await query;
  if (error) {
    console.error(`[analytics-reports] quadrant query failed for ${def.dataSource}:`, error.message);
    return { points: [], xMedian: 0, yMedian: 0 };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const points = rows
    .map((r) => ({
      x: Number(r[xCol] ?? NaN),
      y: Number(r[yCol] ?? NaN),
      label: labelField ? String(r[labelField] ?? r.id) : String(r.id),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  return { points, xMedian: median(points.map((p) => p.x)), yMedian: median(points.map((p) => p.y)) };
}

export async function runQuadrant(def: ReportDefinition): Promise<QuadrantResult> {
  return executeQuadrant(def);
}
export async function previewQuadrant(def: ReportDefinition): Promise<QuadrantResult> {
  return executeQuadrant(def);
}

// ============================================================================
// Cohort — buckets rows into a starting period (week/month, by a chosen date
// field) and cross-tabulates against a breakdown field, e.g. "which status
// did each signup-month's leads end up in".
// ============================================================================
function cohortBucket(raw: unknown, interval: "week" | "month"): { key: string; label: string } {
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { key: "unknown", label: "Unknown" };
  if (interval === "month") {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: d.toLocaleString("en-US", { month: "short", year: "numeric" }) };
  }
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const key = start.toISOString().slice(0, 10);
  return { key, label: key };
}

async function executeCohort(def: ReportDefinition): Promise<CohortResult> {
  const dateField = def.chartConfig?.cohortDateField;
  const breakdownField = def.chartConfig?.cohortBreakdownField;
  const interval = def.chartConfig?.cohortInterval ?? "month";
  const meta = REPORT_DATA_SOURCES[def.dataSource];
  if (!dateField || !breakdownField || !meta.fields.some((f) => f.key === dateField) || !meta.fields.some((f) => f.key === breakdownField)) {
    return { cohorts: [], breakdownValues: [], matrix: [], cohortSizes: [] };
  }

  const supabase = await createClient();
  const cols = Array.from(new Set([dateField, breakdownField, "id"])).join(",");
  let query = supabase.from(meta.table).select(cols).limit(2000);
  query = applyFilters(query, def.dataSource, def.filters);
  const { data, error } = await query;
  if (error) {
    console.error(`[analytics-reports] cohort query failed for ${def.dataSource}:`, error.message);
    return { cohorts: [], breakdownValues: [], matrix: [], cohortSizes: [] };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  const bucketLabels = new Map<string, string>();
  const breakdownValues = new Set<string>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    const { key, label } = cohortBucket(row[dateField], interval);
    bucketLabels.set(key, label);
    const breakdown = String(row[breakdownField] ?? "Unknown");
    breakdownValues.add(breakdown);
    const mapKey = `${key}|${breakdown}`;
    counts.set(mapKey, (counts.get(mapKey) ?? 0) + 1);
  }

  const cohortKeys = Array.from(bucketLabels.keys()).sort();
  const breakdownList = Array.from(breakdownValues).sort();
  const matrix = cohortKeys.map((ck) => breakdownList.map((bv) => counts.get(`${ck}|${bv}`) ?? 0));
  const cohortSizes = matrix.map((row) => row.reduce((s, n) => s + n, 0));

  return { cohorts: cohortKeys.map((k) => bucketLabels.get(k)!), breakdownValues: breakdownList, matrix, cohortSizes };
}

export async function runCohort(def: ReportDefinition): Promise<CohortResult> {
  return executeCohort(def);
}
export async function previewCohort(def: ReportDefinition): Promise<CohortResult> {
  return executeCohort(def);
}

// ============================================================================
// CRUD
// ============================================================================
export async function listReports(folderId?: string | null): Promise<ReportDefinition[]> {
  const supabase = await createClient();
  let query = supabase.from("analytics_reports").select(REPORT_COLUMNS).order("name");
  if (folderId !== undefined) {
    query = folderId === null ? query.is("folder_id", null) : query.eq("folder_id", folderId);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[analytics-reports] listReports failed:", error.message);
    return [];
  }
  return (data as ReportRow[]).map(rowToDefinition);
}

export async function getReport(id: string): Promise<ReportDefinition | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("analytics_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return rowToDefinition(data as ReportRow);
}

export async function createReport(input: Omit<ReportDefinition, "id" | "systemKey">): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_reports")
    .insert({
      folder_id: input.folderId,
      name: input.name,
      description: input.description ?? null,
      data_source: input.dataSource,
      metric: input.metric,
      group_by: input.groupBy ?? null,
      group_by_interval: input.groupByInterval ?? null,
      filters: input.filters,
      chart_type: input.chartType,
      chart_config: input.chartConfig ?? {},
    })
    .select("id")
    .single();
  if (error) {
    console.error("[analytics-reports] createReport failed:", error.message);
    return null;
  }
  return { id: data.id };
}

export async function updateReport(id: string, input: Partial<Omit<ReportDefinition, "id" | "systemKey">>): Promise<boolean> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.folderId !== undefined) patch.folder_id = input.folderId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.dataSource !== undefined) patch.data_source = input.dataSource;
  if (input.metric !== undefined) patch.metric = input.metric;
  if (input.groupBy !== undefined) patch.group_by = input.groupBy;
  if (input.groupByInterval !== undefined) patch.group_by_interval = input.groupByInterval;
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.chartType !== undefined) patch.chart_type = input.chartType;
  if (input.chartConfig !== undefined) patch.chart_config = input.chartConfig;

  const { error } = await supabase.from("analytics_reports").update(patch).eq("id", id);
  if (error) {
    console.error("[analytics-reports] updateReport failed:", error.message);
    return false;
  }
  return true;
}

export async function deleteReport(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_reports").delete().eq("id", id);
  if (error) {
    console.error("[analytics-reports] deleteReport failed:", error.message);
    return false;
  }
  return true;
}

export async function duplicateReport(id: string): Promise<{ id: string } | null> {
  const original = await getReport(id);
  if (!original) return null;
  return createReport({ ...original, name: `${original.name} (Copy)` });
}
