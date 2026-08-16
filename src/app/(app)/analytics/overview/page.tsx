import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/queries/users";
import { getOverviewAnalytics, type OverviewFilters } from "@/lib/queries/analytics-overview";
import type { DateRangePreset, ComparisonMode } from "@/lib/analytics/overview-metrics";
import { AnalyticsOverviewView } from "@/components/analytics/overview/analytics-overview-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];
const VALID_COMPARISONS: ComparisonMode[] = ["previous_period", "previous_month", "previous_quarter", "previous_year", "none"];

interface OverviewSearchParams {
  range?: string;
  from?: string;
  to?: string;
  compare?: string;
  owner?: string;
  campaign?: string;
  segment?: string;
  industry?: string;
  source?: string;
  stage?: string;
  gran?: string;
}

export default async function AnalyticsOverviewPage({ searchParams }: { searchParams: Promise<OverviewSearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const filters: OverviewFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    customFrom: sp.from,
    customTo: sp.to,
    comparison: (VALID_COMPARISONS.includes(sp.compare as ComparisonMode) ? sp.compare : "previous_period") as ComparisonMode,
    owner: sp.owner,
    campaignId: sp.campaign,
    segmentId: sp.segment,
    industry: sp.industry,
    source: sp.source,
    stage: sp.stage as OverviewFilters["stage"],
    granularityOverride: sp.gran === "daily" || sp.gran === "weekly" || sp.gran === "monthly" ? sp.gran : undefined,
  };

  const [data, { data: campaignsData }, { data: segmentsData }, { data: leadsForFacets }, users] = await Promise.all([
    getOverviewAnalytics(filters),
    supabase.from("campaigns").select("id, campaign_name").order("campaign_name"),
    supabase.from("segments").select("id, segment_name").order("segment_name"),
    supabase.from("leads").select("industry, source").not("industry", "is", null).not("source", "is", null),
    getUsers(),
  ]);

  const industries = Array.from(new Set((leadsForFacets || []).map((l) => l.industry).filter(Boolean) as string[])).sort();
  const sources = Array.from(new Set((leadsForFacets || []).map((l) => l.source).filter(Boolean) as string[])).sort();

  return (
    <AnalyticsOverviewView
      data={data}
      filters={filters}
      campaigns={(campaignsData as { id: string; campaign_name: string }[]) || []}
      segments={(segmentsData as { id: string; segment_name: string }[]) || []}
      industries={industries}
      sources={sources}
      users={users.map((u) => ({ id: u.user_id, name: u.full_name }))}
    />
  );
}
