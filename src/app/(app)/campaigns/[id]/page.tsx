import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPendingCount } from "@/lib/queries/campaigns";
import { getSegments } from "@/lib/queries/segments";
import { getLeadStats } from "@/lib/queries/leads";
import { CampaignDetailView } from "@/components/campaigns/campaign-detail-view";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, segments, leadStats, pending] = await Promise.all([
    getCampaignById(id),
    getSegments(),
    getLeadStats(),
    getCampaignPendingCount(id),
  ]);
  if (!campaign) notFound();

  const seg = campaign.segment_id ? segments.find((s) => s.id === campaign.segment_id) : null;
  const audience = seg ? seg.contacts : leadStats.total;
  const audienceLabel = seg ? seg.segment_name : "All leads";

  return <CampaignDetailView campaign={campaign} audience={audience} audienceLabel={audienceLabel} pendingJobs={pending} />;
}
