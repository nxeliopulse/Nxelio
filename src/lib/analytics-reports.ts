// Shared (client + server) report-definition model + the data-source whitelist
// registry. No "use server" here so the report builder UI can import the
// field/operator catalogs and types directly — mirrors the split already
// used by src/lib/segments.ts for the segment rule model.

export type ReportDataSource = "leads" | "opportunities" | "campaigns" | "accounts" | "contacts" | "meetings" | "segments";

export type MetricDefinition =
  | { type: "count" }
  | { type: "sum"; column: string }
  | { type: "avg"; column: string };

export type FilterOperator = "eq" | "in" | "date_range" | "gt" | "lt";

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string | number | string[] | { start: string; end: string };
}

/** Must-have v1 chart types (builder-selectable) plus a few system-only types
 *  (heatmap/radar/scatter) that legacy panels still render with but which
 *  aren't yet exposed in the report builder's chart-type picker. "target" is
 *  a horizontal bullet-style bar (value vs. a target line) — Zoho's "Target
 *  Meter" component in bar form, a sibling of "gauge" (the arc form).
 *
 *  "comparator"/"quadrant"/"cohort" need extra fields beyond the standard
 *  metric+groupBy shape — see ChartConfig. "zone"/"stage"/"waterfall"/
 *  "anomaly" reuse the standard shape as-is, just rendered differently. */
export type ChartType =
  | "kpi" | "bar" | "column" | "line" | "area" | "donut" | "table" | "funnel" | "gauge" | "target"
  | "zone" | "stage" | "waterfall" | "anomaly" | "comparator" | "quadrant" | "cohort"
  | "heatmap" | "radar" | "scatter";

/** The chart types a user can pick when building a new generic report. */
export const BUILDER_CHART_TYPES: ChartType[] = [
  "kpi", "bar", "column", "line", "area", "donut", "table", "funnel", "gauge", "target",
  "zone", "stage", "waterfall", "anomaly", "comparator", "quadrant", "cohort",
];

/** Extra, chart-type-specific settings that don't fit the standard
 *  metric+groupBy+filters shape. Stored in analytics_reports.chart_config
 *  (JSONB) — additive, doesn't touch the core report columns. */
export interface ChartConfig {
  /** Comparator: one or more metrics compared across two periods. */
  comparatorMetrics?: { label: string; metric: MetricDefinition }[];
  comparatorPeriod?: "month" | "quarter" | "year";
  /** Quadrant: the second numeric axis (the metric/column pair supplies the first). */
  quadrantYColumn?: string;
  quadrantXLabel?: string;
  quadrantYLabel?: string;
  /** Cohort: bucket rows into a starting period, cross-tabbed against a breakdown field. */
  cohortDateField?: string;
  cohortInterval?: "week" | "month";
  cohortBreakdownField?: string;
  /** Anomaly Detection: how many standard deviations from the mean counts as an outlier. */
  anomalyThreshold?: number;
  // Style variations matching Zoho CRM options
  kpiStyle?: "standard" | "growth" | "basic";
  comparatorStyle?: "elegant" | "sport" | "classic";
  targetMeterStyle?: "dial" | "traffic" | "bar" | "multibar";
  funnelStyle?: "standard" | "compact" | "segment" | "classic" | "path";
}

export interface ReportDefinition {
  id?: string;
  folderId: string | null;
  name: string;
  description?: string | null;
  dataSource: ReportDataSource;
  metric: MetricDefinition;
  groupBy?: string | null;
  groupByInterval?: "day" | "week" | "month" | "year" | null;
  filters: FilterCondition[];
  chartType: ChartType;
  chartConfig?: ChartConfig;
  /** Present only for seeded legacy panels rendered via analytics.ts directly. */
  systemKey?: string | null;
}

/** Which result shape a chart type needs — used both server-side (to decide
 *  whether to call runReport vs. runComparator/runQuadrant/runCohort) and
 *  client-side (AnyChartRenderer's dispatch), so it lives here rather than
 *  in a component file to avoid pulling client-only chart code into
 *  server-only query modules. */
export type ChartResultKind = "standard" | "comparator" | "quadrant" | "cohort";
export function chartKindFor(chartType: ChartType): ChartResultKind {
  if (chartType === "comparator") return "comparator";
  if (chartType === "quadrant") return "quadrant";
  if (chartType === "cohort") return "cohort";
  return "standard";
}

/** Comparator's result: one row per metric, with each period's total. */
export interface ComparatorResult {
  periodLabels: [string, string];
  rows: { label: string; current: number; previous: number }[];
}

/** Quadrant's result: raw per-record points (not aggregated). */
export interface QuadrantPoint {
  x: number;
  y: number;
  label: string;
}
export interface QuadrantResult {
  points: QuadrantPoint[];
  xMedian: number;
  yMedian: number;
}

/** Cohort's result: cohort periods as rows, breakdown values as columns. */
export interface CohortResult {
  cohorts: string[];
  breakdownValues: string[];
  matrix: number[][];
  cohortSizes: number[];
}

export interface ReportResultRow {
  /** Dimension value, or the metric's own label for a single-value (KPI/gauge) report. */
  label: string;
  value: number;
  /** For combo/target-vs-actual widgets (e.g. a gauge's target, or a 2nd bar series). */
  value2?: number;
  /** For multi-series bar/line/area when the dimension has a secondary breakdown. */
  series?: Record<string, number>;
  /** Passthrough — e.g. a stage color hint, or a row id for drill-through. */
  meta?: Record<string, unknown>;
}

export interface ReportResult {
  rows: ReportResultRow[];
  total: number;
  generatedAt: string;
}

export interface FieldMeta {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  filterable: boolean;
  groupable: boolean;
  sumable?: boolean;
}

export interface DataSourceMeta {
  table: string;
  label: string;
  defaultDateField: string;
  fields: FieldMeta[];
}

/**
 * The security boundary for the report engine: only columns listed here can
 * ever reach a Supabase filter/select/group call (src/lib/queries/analytics-reports.ts
 * drops anything not in this list before it touches the database — never
 * raw, caller-supplied SQL or column names).
 */
export const REPORT_DATA_SOURCES: Record<ReportDataSource, DataSourceMeta> = {
  leads: {
    table: "leads",
    label: "Leads",
    defaultDateField: "created_at",
    fields: [
      { key: "status", label: "Status", type: "text", filterable: true, groupable: true },
      { key: "industry", label: "Industry", type: "text", filterable: true, groupable: true },
      { key: "source", label: "Source", type: "text", filterable: true, groupable: true },
      { key: "interest_area", label: "Interest Area", type: "text", filterable: true, groupable: true },
      { key: "owner_id", label: "Owner", type: "text", filterable: true, groupable: true },
      { key: "lead_score", label: "Lead Score", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
  opportunities: {
    table: "opportunities",
    label: "Opportunities / Deals",
    defaultDateField: "created_at",
    fields: [
      { key: "stage", label: "Stage", type: "text", filterable: true, groupable: true },
      { key: "owner_id", label: "Owner", type: "text", filterable: true, groupable: true },
      { key: "deal_value", label: "Deal Value", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
      { key: "closed_at", label: "Closed", type: "date", filterable: true, groupable: true },
    ],
  },
  campaigns: {
    table: "campaigns",
    label: "Campaigns",
    defaultDateField: "created_at",
    fields: [
      { key: "campaign_type", label: "Type", type: "text", filterable: true, groupable: true },
      { key: "status", label: "Status", type: "text", filterable: true, groupable: true },
      { key: "campaign_name", label: "Campaign", type: "text", filterable: false, groupable: true },
      { key: "sent_count", label: "Sent", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "open_rate", label: "Open Rate", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "reply_rate", label: "Reply Rate", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "bounce_rate", label: "Bounce Rate", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
  accounts: {
    table: "accounts",
    label: "Accounts",
    defaultDateField: "created_at",
    fields: [
      { key: "industry", label: "Industry", type: "text", filterable: true, groupable: true },
      { key: "account_type", label: "Type", type: "text", filterable: true, groupable: true },
      { key: "rating", label: "Rating", type: "text", filterable: true, groupable: true },
      { key: "account_owner", label: "Owner", type: "text", filterable: true, groupable: true },
      { key: "annual_revenue", label: "Annual Revenue", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "employees", label: "Employees", type: "number", filterable: true, groupable: false, sumable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
  contacts: {
    table: "contacts",
    label: "Contacts",
    defaultDateField: "created_at",
    fields: [
      { key: "lead_source", label: "Lead Source", type: "text", filterable: true, groupable: true },
      { key: "department", label: "Department", type: "text", filterable: true, groupable: true },
      { key: "contact_owner", label: "Owner", type: "text", filterable: true, groupable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
  meetings: {
    table: "meetings",
    label: "Meetings",
    defaultDateField: "start_at",
    fields: [
      { key: "status", label: "Status", type: "text", filterable: true, groupable: true },
      { key: "provider", label: "Provider", type: "text", filterable: true, groupable: true },
      { key: "start_at", label: "Start Date", type: "date", filterable: true, groupable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
  segments: {
    table: "segments",
    label: "Segments / Audiences",
    defaultDateField: "created_at",
    fields: [
      { key: "segment_type", label: "Type", type: "text", filterable: true, groupable: true },
      { key: "status", label: "Status", type: "text", filterable: true, groupable: true },
      { key: "logic_type", label: "Logic", type: "text", filterable: true, groupable: true },
      { key: "created_at", label: "Created", type: "date", filterable: true, groupable: true },
    ],
  },
};

export function fieldMeta(dataSource: ReportDataSource, key: string): FieldMeta | undefined {
  return REPORT_DATA_SOURCES[dataSource].fields.find((f) => f.key === key);
}

export function isRealField(dataSource: ReportDataSource, key: string): boolean {
  return REPORT_DATA_SOURCES[dataSource].fields.some((f) => f.key === key);
}

/** Count + Sum/Avg-of-each-sumable-column, used by the Comparator builder's
 *  metric checklist (Comparator compares several metrics at once, unlike
 *  every other chart type which has exactly one). */
export function metricPresetsFor(dataSource: ReportDataSource): { label: string; metric: MetricDefinition }[] {
  const meta = REPORT_DATA_SOURCES[dataSource];
  const presets: { label: string; metric: MetricDefinition }[] = [{ label: "Count", metric: { type: "count" } }];
  for (const f of meta.fields.filter((f) => f.sumable)) {
    presets.push({ label: `Sum of ${f.label}`, metric: { type: "sum", column: f.key } });
    presets.push({ label: `Average ${f.label}`, metric: { type: "avg", column: f.key } });
  }
  return presets;
}

/** A report is buildable in the generic engine once it has a data source and a metric
 *  (sum/avg metrics additionally need a resolvable, sumable column). Comparator,
 *  Quadrant, and Cohort need their own extra chart_config fields checked here too. */
export function isReportDefinitionComplete(def: Partial<ReportDefinition>): boolean {
  if (!def.dataSource || !def.chartType) return false;

  if (def.chartType === "comparator") {
    return !!def.chartConfig?.comparatorMetrics?.length;
  }
  if (def.chartType === "quadrant") {
    const metric = def.metric;
    if (!metric || metric.type === "count") return false;
    return !!fieldMeta(def.dataSource, metric.column)?.sumable && !!def.chartConfig?.quadrantYColumn;
  }
  if (def.chartType === "cohort") {
    return !!def.chartConfig?.cohortDateField && !!def.chartConfig?.cohortBreakdownField;
  }

  if (!def.metric) return false;
  if (def.metric.type !== "count") {
    const meta = fieldMeta(def.dataSource, def.metric.column);
    if (!meta?.sumable) return false;
  }
  return true;
}
