/** Catalog of every widget selectable in the dashboard's "Edit layout" widget
 *  library, plus the built-in default arrangement. Widget rendering itself
 *  lives in src/components/dashboard/dashboard-view.tsx (renderWidget) —
 *  this file only holds the metadata needed to list, categorize, and lay
 *  out widgets, so a saved layout (see src/lib/queries/dashboard-layouts.ts)
 *  can store a plain ordered array of these keys.
 */

export type WidgetKey =
  // Lead Nurturing Primary KPIs
  | "total_leads"
  | "engagement_rate"
  | "lead_conversion_rate"
  | "avg_days_to_qualify"
  | "qualified_leads"
  | "hot_leads_kpi"
  | "qualified_pipeline_value"
  | "avg_lead_age"
  // Legacy / CRM KPIs
  | "total_sales"
  | "win_rate"
  | "close_rate"
  | "avg_days_to_close"
  | "pipeline_value"
  | "open_deals"
  | "weighted_value"
  | "avg_open_deal_age"
  // Charts & Cards
  | "lead_funnel"
  | "lead_growth"
  | "lead_sources"
  | "campaign_performance"
  | "hot_leads"
  | "hot_lead_alerts"
  | "ai_insights"
  | "sales_pipeline"
  | "deals_projection"
  | "recent_deals"
  | "won_deals_trend"
  | "deal_outcomes"
  | "team_performance"
  | "recent_activity";

export type WidgetCategory = "Lead KPIs" | "Pipeline snapshot" | "Trends" | "Team" | "Leads & marketing" | "AI & Insights";

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
  // ── Lead KPIs (Nxelio Nurture primary) ──
  { key: "total_leads", label: "Total leads", category: "Lead KPIs", size: 3 },
  { key: "engagement_rate", label: "Engagement rate", category: "Lead KPIs", size: 3 },
  { key: "lead_conversion_rate", label: "Lead conversion rate", category: "Lead KPIs", size: 3 },
  { key: "avg_days_to_qualify", label: "Avg days to qualify", category: "Lead KPIs", size: 3 },
  { key: "qualified_leads", label: "Qualified leads", category: "Lead KPIs", size: 3 },
  { key: "hot_leads_kpi", label: "Hot leads", category: "Lead KPIs", size: 3 },
  { key: "qualified_pipeline_value", label: "Qualified pipeline value", category: "Lead KPIs", size: 3 },
  { key: "avg_lead_age", label: "Avg lead age", category: "Lead KPIs", size: 3 },

  // ── Sales & Deals Snapshot ──
  { key: "total_sales", label: "Total sales", category: "Pipeline snapshot", size: 3 },
  { key: "win_rate", label: "Win rate", category: "Pipeline snapshot", size: 3 },
  { key: "close_rate", label: "Close rate", category: "Pipeline snapshot", size: 3 },
  { key: "avg_days_to_close", label: "Avg days to close", category: "Pipeline snapshot", size: 3 },
  { key: "pipeline_value", label: "Pipeline value", category: "Pipeline snapshot", size: 3 },
  { key: "open_deals", label: "Open deals", category: "Pipeline snapshot", size: 3 },
  { key: "weighted_value", label: "Weighted value", category: "Pipeline snapshot", size: 3 },
  { key: "avg_open_deal_age", label: "Avg open deal age", category: "Pipeline snapshot", size: 3 },

  // ── AI & Insights ──
  { key: "ai_insights", label: "Nxelio AI Intelligence", category: "AI & Insights", size: 4 },

  // ── Lead Nurturing & Marketing ──
  { key: "lead_funnel", label: "Lead funnel", category: "Leads & marketing", size: 4 },
  { key: "lead_growth", label: "Lead growth", category: "Leads & marketing", size: 4 },
  { key: "lead_sources", label: "Lead sources", category: "Leads & marketing", size: 4 },
  { key: "campaign_performance", label: "Campaign performance", category: "Leads & marketing", size: 4 },
  { key: "hot_leads", label: "Hot lead alerts", category: "Leads & marketing", size: 4 },
  { key: "hot_lead_alerts", label: "Hot lead alerts list", category: "Leads & marketing", size: 4 },
  { key: "recent_activity", label: "Recent activity", category: "Leads & marketing", size: 4 },

  // ── Sales & Opportunities Pipeline ──
  { key: "sales_pipeline", label: "Sales pipeline", category: "Trends", size: 4 },
  { key: "deals_projection", label: "Revenue projection", category: "Trends", size: 4 },
  { key: "recent_deals", label: "Recent opportunities", category: "Trends", size: 4 },
  { key: "won_deals_trend", label: "Won deals trend", category: "Trends", size: 6 },
  { key: "deal_outcomes", label: "Deal outcomes", category: "Trends", size: 6 },

  // ── Team ──
  { key: "team_performance", label: "Team performance", category: "Team", size: 6 },
];

export const WIDGET_LABELS: Record<WidgetKey, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.key, w.label])
) as Record<WidgetKey, string>;

export const WIDGET_SIZES: Record<WidgetKey, WidgetSize> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.key, w.size])
) as Record<WidgetKey, WidgetSize>;

export const WIDGET_CATEGORIES: WidgetCategory[] = ["Lead KPIs", "AI & Insights", "Leads & marketing", "Pipeline snapshot", "Trends", "Team"];

export function isWidgetKey(value: string): value is WidgetKey {
  return value in WIDGET_LABELS;
}

/** All sizes a widget can be dragged/snapped to, smallest to largest */
export const WIDGET_SIZE_OPTIONS: WidgetSize[] = [3, 4, 6, 8, 12];

export function clampWidgetSize(size: number): WidgetSize {
  return WIDGET_SIZE_OPTIONS.reduce((closest, s) => (Math.abs(s - size) < Math.abs(closest - size) ? s : closest), WIDGET_SIZE_OPTIONS[0]);
}

export interface LayoutWidget {
  key: WidgetKey;
  size: WidgetSize;
}

/** The default Nxelio Nurture layout — centered on the lead nurturing journey:
 *  Lead KPIs → Lead Funnel & Growth → Campaign & AI Intelligence → Sales Pipeline & Forecast
 */
export const DEFAULT_LAYOUT: LayoutWidget[] = [
  // ── Row 1 & 2: 8 Lead KPIs (4 per row on lg) ──
  { key: "total_leads", size: 3 },
  { key: "engagement_rate", size: 3 },
  { key: "lead_conversion_rate", size: 3 },
  { key: "avg_days_to_qualify", size: 3 },
  { key: "qualified_leads", size: 3 },
  { key: "hot_leads_kpi", size: 3 },
  { key: "qualified_pipeline_value", size: 3 },
  { key: "avg_lead_age", size: 3 },

  // ── Row 3: Lead Funnel, Lead Growth, Lead Sources (3 columns across 12) ──
  { key: "lead_funnel", size: 4 },
  { key: "lead_growth", size: 4 },
  { key: "lead_sources", size: 4 },

  // ── Row 4: Campaign Performance, Hot Lead Alerts, AI Intelligence (3 columns across 12) ──
  { key: "campaign_performance", size: 4 },
  { key: "hot_leads", size: 4 },
  { key: "ai_insights", size: 4 },

  // ── Row 5: Sales Pipeline, Revenue Projection, Recent Opportunities (3 columns across 12) ──
  { key: "sales_pipeline", size: 4 },
  { key: "deals_projection", size: 4 },
  { key: "recent_deals", size: 4 },
];
