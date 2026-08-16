import { createClient } from "@/lib/supabase/server";
import { getCampaignsAnalytics, type CampaignsFilters } from "@/lib/queries/analytics-campaigns";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { CampaignsView } from "@/components/analytics/campaigns/campaigns-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

interface CampaignsSearchParams {
  range?: string;
  from?: string;
  to?: string;
  status?: string;
  segment?: string;
  campaign?: string;
}

export default async function AnalyticsCampaignsPage({ searchParams }: { searchParams: Promise<CampaignsSearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const filters: CampaignsFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    customFrom: sp.from,
    customTo: sp.to,
    status: sp.status,
    segmentId: sp.segment,
    campaignId: sp.campaign,
  };

  const [data, { data: campaignsData }, { data: segmentsData }] = await Promise.all([
    getCampaignsAnalytics(filters),
    supabase.from("campaigns").select("id, campaign_name").order("campaign_name"),
    supabase.from("segments").select("id, segment_name").order("segment_name"),
  ]);

  return (
    <CampaignsView
      data={data}
      filters={filters}
      campaigns={(campaignsData as { id: string; campaign_name: string }[]) || []}
      segments={(segmentsData as { id: string; segment_name: string }[]) || []}
    />
  );
}
