/** Catalog of every widget selectable in the dashboard's "Edit layout" widget
 *  library, plus the built-in default arrangement. Widget rendering itself
 *  lives in src/components/dashboard/dashboard-view.tsx (renderWidget) —
 *  this file only holds the metadata needed to list, categorize, and lay
 *  out widgets, so a saved layout (see src/lib/queries/dashboard-layouts.ts)
 *  can store a plain ordered array of these keys.
 */

export type WidgetKey =
  | "total_sales"
  | "win_rate"
  | "close_rate"
  | "avg_days_to_close"
  | "pipeline_value"
  | "open_deals"
  | "weighted_value"
  | "avg_open_deal_age"
  | "won_deals_trend"
  | "deals_projection"
  | "sales_pipeline"
  | "deal_outcomes"
  | "team_performance"
  | "lead_growth"
  | "hot_leads"
  | "recent_activity"
  | "campaign_performance"
  | "lead_sources"
  | "recent_deals"
  | "ai_insights";

export type WidgetCategory = "Pipeline snapshot" | "Trends" | "Team" | "Leads & marketing" | "AI & Insights";

/** Tailwind lg:col-span-N out of a 12-col grid — how much room a widget
 *  takes on wide screens. Every widget is full-width below lg. */
export type WidgetSize = 3 | 4 | 6 | 8 | 12;

export interface WidgetCatalogEntry {
  key: WidgetKey;
  label: string;
  category: WidgetCategory;
  size: WidgetSize;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  { key: "total_sales", label: "Total sales", category: "Pipeline snapshot", size: 3 },
  { key: "win_rate", label: "Win rate", category: "Pipeline snapshot", size: 3 },
  { key: "close_rate", label: "Close rate", category: "Pipeline snapshot", size: 3 },
  { key: "avg_days_to_close", label: "Avg days to close", category: "Pipeline snapshot", size: 3 },
  { key: "pipeline_value", label: "Pipeline value", category: "Pipeline snapshot", size: 3 },
  { key: "open_deals", label: "Open deals", category: "Pipeline snapshot", size: 3 },
  { key: "weighted_value", label: "Weighted value", category: "Pipeline snapshot", size: 3 },
  { key: "avg_open_deal_age", label: "Avg open deal age", category: "Pipeline snapshot", size: 3 },

  // Every chart widget defaults to the same half-width (6 of 12 cols) so
  // they line up two-per-row in a clean grid regardless of chart type —
  // only the small stat tiles above get their own smaller default size.
  { key: "ai_insights", label: "AI Insights & Recommendations", category: "AI & Insights", size: 12 },
  { key: "won_deals_trend", label: "Won deals trend", category: "Trends", size: 6 },
  { key: "deals_projection", label: "Deals projection", category: "Trends", size: 6 },
  { key: "sales_pipeline", label: "Sales pipeline", category: "Trends", size: 6 },
  { key: "deal_outcomes", label: "Deal outcomes", category: "Trends", size: 6 },
  { key: "recent_deals", label: "Recent deals", category: "Trends", size: 6 },

  { key: "team_performance", label: "Team performance", category: "Team", size: 6 },

  { key: "lead_growth", label: "Lead growth", category: "Leads & marketing", size: 6 },
  { key: "hot_leads", label: "Hot lead alerts", category: "Leads & marketing", size: 6 },
  { key: "recent_activity", label: "Recent activity", category: "Leads & marketing", size: 6 },
  { key: "campaign_performance", label: "Campaign performance", category: "Leads & marketing", size: 6 },
  { key: "lead_sources", label: "Lead sources", category: "Leads & marketing", size: 6 },
];

export const WIDGET_LABELS: Record<WidgetKey, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.key, w.label])
) as Record<WidgetKey, string>;

export const WIDGET_SIZES: Record<WidgetKey, WidgetSize> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.key, w.size])
) as Record<WidgetKey, WidgetSize>;

export const WIDGET_CATEGORIES: WidgetCategory[] = ["AI & Insights", "Pipeline snapshot", "Trends", "Team", "Leads & marketing"];

export function isWidgetKey(value: string): value is WidgetKey {
  return value in WIDGET_LABELS;
}

/** All sizes a widget can be dragged/snapped to, smallest to largest —
 *  the resize handle in dashboard-view.tsx snaps to the nearest of these
 *  rather than allowing arbitrary pixel widths. */
export const WIDGET_SIZE_OPTIONS: WidgetSize[] = [3, 4, 6, 8, 12];

export function clampWidgetSize(size: number): WidgetSize {
  return WIDGET_SIZE_OPTIONS.reduce((closest, s) => (Math.abs(s - size) < Math.abs(closest - size) ? s : closest), WIDGET_SIZE_OPTIONS[0]);
}

/** One widget's placement inside a saved (or the built-in default) layout —
 *  which widget, and how wide the person has sized it. `size` starts at the
 *  catalog default (WIDGET_SIZES) but can be dragged wider/narrower per
 *  layout via the resize handle, independent of every other layout. */
export interface LayoutWidget {
  key: WidgetKey;
  size: WidgetSize;
}

/** The built-in "System" layout — exactly what the dashboard showed before
 *  layouts existed, so nobody's view changes until they opt into editing. */
export const DEFAULT_LAYOUT: LayoutWidget[] = [
  "total_sales", "win_rate", "close_rate", "avg_days_to_close",
  "pipeline_value", "open_deals", "weighted_value", "avg_open_deal_age",
  "ai_insights",
  "won_deals_trend", "deals_projection", "team_performance",
  "sales_pipeline", "deal_outcomes", "recent_deals",
  "lead_growth", "hot_leads",
].map((key) => ({ key: key as WidgetKey, size: WIDGET_SIZES[key as WidgetKey] }));
