import { createClient } from "@/lib/supabase/server";
import { getCampaignsAnalytics, type CampaignsFilters } from "@/lib/queries/analytics-campaigns";
import { CampaignsView } from "@/components/analytics/campaigns/campaigns-view";

export default async function AnalyticsCampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string; campaign?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const filters: CampaignsFilters = { dateRange: "last_30_days", status: sp.status, campaignId: sp.campaign };

  const [data, { data: campaignsData }] = await Promise.all([
    getCampaignsAnalytics(filters),
    supabase.from("campaigns").select("id, campaign_name").order("campaign_name"),
  ]);

  return <CampaignsView data={data} filters={filters} campaigns={(campaignsData as { id: string; campaign_name: string }[]) || []} />;
}
