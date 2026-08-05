"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { AnyChartRenderer, type AnyChartData } from "@/components/analytics/widgets/AnyChartRenderer";
import {
  REPORT_DATA_SOURCES,
  BUILDER_CHART_TYPES,
  isReportDefinitionComplete,
  metricPresetsFor,
  chartKindFor,
  type ReportDataSource,
  type ReportDefinition,
  type FilterCondition,
  type ChartType,
  type ChartConfig,
} from "@/lib/analytics-reports";
import {
  previewReport,
  previewComparator,
  previewQuadrant,
  previewCohort,
  createReport,
  updateReport,
} from "@/lib/queries/analytics-reports";
import { addWidgetToDashboard } from "@/lib/queries/analytics-dashboards";

const CHART_LABELS: Record<ChartType, string> = {
  kpi: "KPI",
  bar: "Bar",
  column: "Column",
  line: "Line",
  area: "Area",
  donut: "Donut",
  table: "Table",
  funnel: "Funnel",
  gauge: "Gauge",
  target: "Target Meter",
  zone: "Zone",
  stage: "Stage",
  waterfall: "Waterfall",
  anomaly: "Anomaly Detection",
  comparator: "Comparator",
  quadrant: "Quadrant",
  cohort: "Cohort",
  heatmap: "Heatmap",
  radar: "Radar",
  scatter: "Scatter",
};

interface Rule {
  id: string;
  field: string;
  operator: FilterCondition["operator"];
  value: string;
}

function emptyRule(dataSource: ReportDataSource): Rule {
  const first = REPORT_DATA_SOURCES[dataSource].fields.find((f) => f.filterable);
  return { id: Date.now().toString(), field: first?.key ?? "", operator: "eq", value: "" };
}

const EMPTY_PREVIEW: AnyChartData = { kind: "standard", rows: [] };

export function ReportBuilderDrawer({
  open,
  onClose,
  attachToDashboardId,
  nextSortOrder = 0,
  onSaved,
  editReport,
  initialChartType,
}: {
  open: boolean;
  onClose: () => void;
  attachToDashboardId?: string;
  nextSortOrder?: number;
  onSaved: () => void;
  editReport?: ReportDefinition;
  /** Preselects the chart type when opened from the "Add Component" picker
   *  for a specific component type, instead of always defaulting to Bar. */
  initialChartType?: ChartType;
}) {
  const [name, setName] = useState(editReport?.name ?? "");
  const [dataSource, setDataSource] = useState<ReportDataSource>(editReport?.dataSource ?? "leads");
  const [metricType, setMetricType] = useState<"count" | "sum" | "avg">(editReport?.metric.type ?? "count");
  const [metricColumn, setMetricColumn] = useState<string>(editReport?.metric.type !== "count" ? editReport?.metric.column ?? "" : "");
  const [groupBy, setGroupBy] = useState<string>(editReport?.groupBy ?? "");
  const [chartType, setChartType] = useState<ChartType>(editReport?.chartType ?? initialChartType ?? "bar");
  const [rules, setRules] = useState<Rule[]>(
    editReport?.filters.length
      ? editReport.filters.map((f, i) => ({ id: String(i), field: f.field, operator: f.operator, value: String(f.value) }))
      : []
  );

  // Comparator-only
  const [comparatorMetricLabels, setComparatorMetricLabels] = useState<string[]>(
    editReport?.chartConfig?.comparatorMetrics?.map((m) => m.label) ?? []
  );
  const [comparatorPeriod, setComparatorPeriod] = useState<"month" | "quarter" | "year">(editReport?.chartConfig?.comparatorPeriod ?? "month");
  // Quadrant-only
  const [quadrantXColumn, setQuadrantXColumn] = useState<string>(editReport?.metric.type !== "count" ? editReport?.metric.column ?? "" : "");
  const [quadrantYColumn, setQuadrantYColumn] = useState<string>(editReport?.chartConfig?.quadrantYColumn ?? "");
  // Cohort-only
  const [cohortDateField, setCohortDateField] = useState<string>(editReport?.chartConfig?.cohortDateField ?? "");
  const [cohortInterval, setCohortInterval] = useState<"week" | "month">(editReport?.chartConfig?.cohortInterval ?? "month");
  const [cohortBreakdownField, setCohortBreakdownField] = useState<string>(editReport?.chartConfig?.cohortBreakdownField ?? "");

  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<AnyChartData>(EMPTY_PREVIEW);
  const [previewing, setPreviewing] = useState(false);

  const meta = REPORT_DATA_SOURCES[dataSource];
  const sumableColumns = meta.fields.filter((f) => f.sumable);
  const groupableColumns = meta.fields.filter((f) => f.groupable);
  const dateColumns = meta.fields.filter((f) => f.type === "date");
  const textGroupableColumns = meta.fields.filter((f) => f.groupable && f.type === "text");
  const metricPresets = metricPresetsFor(dataSource);
  const kind = chartKindFor(chartType);

  function buildDefinition(): ReportDefinition {
    const chartConfig: ChartConfig = {};
    let metric: ReportDefinition["metric"] = metricType === "count" ? { type: "count" } : { type: metricType, column: metricColumn };

    if (chartType === "comparator") {
      chartConfig.comparatorMetrics = metricPresets.filter((p) => comparatorMetricLabels.includes(p.label));
      chartConfig.comparatorPeriod = comparatorPeriod;
    } else if (chartType === "quadrant") {
      metric = { type: "sum", column: quadrantXColumn };
      chartConfig.quadrantYColumn = quadrantYColumn;
    } else if (chartType === "cohort") {
      chartConfig.cohortDateField = cohortDateField;
      chartConfig.cohortInterval = cohortInterval;
      chartConfig.cohortBreakdownField = cohortBreakdownField;
    }

    return {
      folderId: editReport?.folderId ?? null,
      name: name || "Untitled report",
      dataSource,
      metric,
      groupBy: chartType === "comparator" || chartType === "cohort" ? null : groupBy || null,
      filters: rules.filter((r) => r.field && r.value).map((r) => ({ field: r.field, operator: r.operator, value: r.value })),
      chartType,
      chartConfig,
    };
  }

  const complete = isReportDefinitionComplete(buildDefinition());

  const rulesKey = JSON.stringify(rules);
  const comparatorMetricsKey = comparatorMetricLabels.join(",");

  useEffect(() => {
    if (!open || !complete) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flips the preview into a loading state whenever the builder's fields change
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const def = buildDefinition();
        if (kind === "comparator") setPreviewData({ kind, result: await previewComparator(def) });
        else if (kind === "quadrant") setPreviewData({ kind, result: await previewQuadrant(def) });
        else if (kind === "cohort") setPreviewData({ kind, result: await previewCohort(def) });
        else {
          const result = await previewReport(def);
          setPreviewData({ kind: "standard", rows: result.rows });
        }
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open, dataSource, metricType, metricColumn, groupBy, chartType, rulesKey,
    comparatorMetricsKey, comparatorPeriod, quadrantXColumn, quadrantYColumn,
    cohortDateField, cohortInterval, cohortBreakdownField,
  ]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form to the report being edited (or blank) each time the drawer opens
    setName(editReport?.name ?? "");
    setDataSource(editReport?.dataSource ?? "leads");
    setMetricType(editReport?.metric.type ?? "count");
    setMetricColumn(editReport?.metric.type !== "count" ? editReport?.metric.column ?? "" : "");
    setGroupBy(editReport?.groupBy ?? "");
    setChartType(editReport?.chartType ?? initialChartType ?? "bar");
    setRules(
      editReport?.filters.length
        ? editReport.filters.map((f, i) => ({ id: String(i), field: f.field, operator: f.operator, value: String(f.value) }))
        : []
    );
    setComparatorMetricLabels(editReport?.chartConfig?.comparatorMetrics?.map((m) => m.label) ?? []);
    setComparatorPeriod(editReport?.chartConfig?.comparatorPeriod ?? "month");
    setQuadrantXColumn(editReport?.metric.type !== "count" ? editReport?.metric.column ?? "" : "");
    setQuadrantYColumn(editReport?.chartConfig?.quadrantYColumn ?? "");
    setCohortDateField(editReport?.chartConfig?.cohortDateField ?? "");
    setCohortInterval(editReport?.chartConfig?.cohortInterval ?? "month");
    setCohortBreakdownField(editReport?.chartConfig?.cohortBreakdownField ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editReport]);

  async function handleSave() {
    setSaving(true);
    try {
      const def = buildDefinition();
      if (editReport?.id) {
        await updateReport(editReport.id, def);
      } else {
        const created = await createReport(def);
        if (created && attachToDashboardId) {
          await addWidgetToDashboard(attachToDashboardId, created.id, { width: 6, height: 4, sortOrder: nextSortOrder });
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editReport ? "Edit report" : "New report"}
      description="Pick a data source and a metric — the chart updates live as you build it."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!complete || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save report"}
          </Button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Title</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deals by stage" />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Data source</label>
          <Select
            value={dataSource}
            onChange={(e) => {
              setDataSource(e.target.value as ReportDataSource);
              setMetricColumn("");
              setGroupBy("");
              setQuadrantXColumn("");
              setQuadrantYColumn("");
              setCohortDateField("");
              setCohortBreakdownField("");
              setComparatorMetricLabels([]);
            }}
          >
            {Object.entries(REPORT_DATA_SOURCES).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>

        {kind === "comparator" ? (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Metrics to compare</label>
              <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 max-h-40 overflow-y-auto">
                {metricPresets.map((p) => (
                  <label key={p.label} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={comparatorMetricLabels.includes(p.label)}
                      onChange={(e) =>
                        setComparatorMetricLabels((cur) => (e.target.checked ? [...cur, p.label] : cur.filter((l) => l !== p.label)))
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Compare by</label>
              <Select value={comparatorPeriod} onChange={(e) => setComparatorPeriod(e.target.value as "month" | "quarter" | "year")}>
                <option value="month">This month vs. last month</option>
                <option value="quarter">This quarter vs. last quarter</option>
                <option value="year">This year vs. last year</option>
              </Select>
            </div>
          </>
        ) : kind === "quadrant" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">X-axis column</label>
                <Select value={quadrantXColumn} onChange={(e) => setQuadrantXColumn(e.target.value)}>
                  <option value="">Select a column…</option>
                  {sumableColumns.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Y-axis column</label>
                <Select value={quadrantYColumn} onChange={(e) => setQuadrantYColumn(e.target.value)}>
                  <option value="">Select a column…</option>
                  {sumableColumns.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-xs text-slate-400">Plots one point per {meta.label.toLowerCase()} record, split into 4 quadrants at the median of each axis.</p>
          </>
        ) : kind === "cohort" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Cohort date field</label>
                <Select value={cohortDateField} onChange={(e) => setCohortDateField(e.target.value)}>
                  <option value="">Select a date field…</option>
                  {dateColumns.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Bucket by</label>
                <Select value={cohortInterval} onChange={(e) => setCohortInterval(e.target.value as "week" | "month")}>
                  <option value="month">Month</option>
                  <option value="week">Week</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Breakdown field</label>
              <Select value={cohortBreakdownField} onChange={(e) => setCohortBreakdownField(e.target.value)}>
                <option value="">Select a field…</option>
                {textGroupableColumns.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-slate-400">Groups {meta.label.toLowerCase()} into cohorts by when they were created, then shows how each cohort breaks down by the field above.</p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Metric</label>
                <Select value={metricType} onChange={(e) => setMetricType(e.target.value as "count" | "sum" | "avg")}>
                  <option value="count">Count</option>
                  <option value="sum">Sum of…</option>
                  <option value="avg">Average of…</option>
                </Select>
              </div>
              {metricType !== "count" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Column</label>
                  <Select value={metricColumn} onChange={(e) => setMetricColumn(e.target.value)}>
                    <option value="">Select a column…</option>
                    {sumableColumns.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Group by (optional)</label>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="">None — single total</option>
                {groupableColumns.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
              {chartType === "anomaly" && !groupBy && (
                <p className="text-xs text-amber-600 mt-1">Anomaly Detection needs a trend to look at — pick a date field to group by.</p>
              )}
            </div>
          </>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-500">Filters</label>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--primary)] flex items-center gap-1"
              onClick={() => setRules((r) => [...r, emptyRule(dataSource)])}
            >
              <Plus className="h-3.5 w-3.5" /> Add condition
            </button>
          </div>
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={rule.field}
                  onChange={(e) => setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, field: e.target.value } : r)))}
                >
                  {meta.fields
                    .filter((f) => f.filterable)
                    .map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                </Select>
                <Select
                  className="w-28 flex-shrink-0"
                  value={rule.operator}
                  onChange={(e) => setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, operator: e.target.value as FilterCondition["operator"] } : r)))}
                >
                  <option value="eq">equals</option>
                  <option value="gt">greater than</option>
                  <option value="lt">less than</option>
                </Select>
                <Input
                  className="flex-1"
                  value={rule.value}
                  onChange={(e) => setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, value: e.target.value } : r)))}
                  placeholder="Value"
                />
                <button
                  type="button"
                  className="p-1.5 rounded text-slate-400 hover:text-rose-500 flex-shrink-0"
                  onClick={() => setRules((rs) => rs.filter((r) => r.id !== rule.id))}
                  aria-label="Remove condition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {rules.length === 0 && <p className="text-xs text-slate-400">No filters — every {meta.label.toLowerCase()} row is included.</p>}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Chart type</label>
          <div className="flex flex-wrap gap-1.5">
            {BUILDER_CHART_TYPES.map((ct) => {
              const disabled = (ct === "kpi" || ct === "gauge" || ct === "target") && !!groupBy;
              return (
                <button
                  key={ct}
                  type="button"
                  disabled={disabled}
                  onClick={() => setChartType(ct)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    disabled
                      ? "opacity-40 cursor-not-allowed border-slate-100 text-slate-300"
                      : chartType === ct
                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {CHART_LABELS[ct]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Live preview</label>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 min-h-[140px]">
            {!complete ? (
              <p className="p-5 text-xs text-slate-400 text-center">Fill in the fields above to see a preview.</p>
            ) : previewing && previewData === EMPTY_PREVIEW ? (
              <p className="p-5 text-xs text-slate-400 text-center">Loading preview…</p>
            ) : (
              <AnyChartRenderer config={{ chartType, title: name || "Preview" }} data={previewData} />
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
