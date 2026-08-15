import { createClient } from "@/lib/supabase/server";
import { getEngagementAnalytics, type EngagementFilters } from "@/lib/queries/analytics-engagement";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { EngagementView } from "@/components/analytics/engagement/engagement-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

export default async function AnalyticsEngagementPage({ searchParams }: { searchParams: Promise<{ range?: string; campaign?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const filters: EngagementFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    campaignId: sp.campaign,
  };

  const [data, { data: campaignsData }] = await Promise.all([
    getEngagementAnalytics(filters),
    supabase.from("campaigns").select("id, campaign_name").order("campaign_name"),
  ]);

  return <EngagementView data={data} filters={filters} campaigns={(campaignsData as { id: string; campaign_name: string }[]) || []} />;
}
