import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPendingCount } from "@/lib/queries/campaigns";
import { getSegments, getSegmentMemberLeads } from "@/lib/queries/segments";
import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getInboxConversations } from "@/lib/queries/inbox";
import { getCampaignLeadActivity } from "@/lib/email/campaign-stats";
import { hasFeature } from "@/lib/queries/subscriptions";
import { CampaignDetailView } from "@/components/campaigns/campaign-detail-view";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, segments, leadStats, pending, inboxConversations, allLeads, leadActivity, replyTrackingEnabled] = await Promise.all([
    getCampaignById(id),
    getSegments(),
    getLeadStats(),
    getCampaignPendingCount(id),
    getInboxConversations(id),
    getLeads(),
    getCampaignLeadActivity(id),
    hasFeature("reply_tracking"),
  ]);
  if (!campaign) notFound();

  const seg = campaign.segment_id ? segments.find((s) => s.id === campaign.segment_id) : null;
  const audience = seg ? seg.contacts : leadStats.total;
  const audienceLabel = seg ? seg.segment_name : "All leads";
  // The Audience tab shows who this campaign actually targets (the full segment/
  // workspace membership), not just who's already been sent to — that distinction
  // used to make this list read empty until the first send even landed.
  const audienceLeads = campaign.segment_id ? await getSegmentMemberLeads(campaign.segment_id) : allLeads;

  return (
    <CampaignDetailView
      campaign={campaign}
      audience={audience}
      audienceLabel={audienceLabel}
      pendingJobs={pending}
      inboxConversations={inboxConversations}
      audienceLeads={audienceLeads}
      leadActivity={leadActivity}
      replyTrackingEnabled={replyTrackingEnabled}
    />
  );
}
