import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPendingCount } from "@/lib/queries/campaigns";
import { getSegments, getSegmentMemberLeads } from "@/lib/queries/segments";
import { getLeads, getLeadStats, type LeadRow } from "@/lib/queries/leads";
import { getUsers } from "@/lib/queries/users";
import { getInboxConversations } from "@/lib/queries/inbox";
import { getCampaignLeadActivity } from "@/lib/email/campaign-stats";
import { hasFeature } from "@/lib/queries/subscriptions";
import { getEnrolledLeads } from "@/lib/campaigns/enrollment";
import { CampaignDetailView } from "@/components/campaigns/campaign-detail-view";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, segments, leadStats, pending, inboxConversations, allLeads, leadActivity, replyTrackingEnabled, users, enrolledLeads] = await Promise.all([
    getCampaignById(id),
    getSegments(),
    getLeadStats(),
    getCampaignPendingCount(id),
    getInboxConversations(id),
    getLeads(),
    getCampaignLeadActivity(id),
    hasFeature("reply_tracking"),
    getUsers(),
    getEnrolledLeads<LeadRow>(id),
  ]);
  if (!campaign) notFound();

  const seg = campaign.segment_id ? segments.find((s) => s.id === campaign.segment_id) : null;
  const audience = seg ? seg.contacts : leadStats.total;
  const audienceLabel = seg ? seg.segment_name : "All leads";
  const owners = Object.fromEntries(users.map((u) => [u.user_id, u.full_name]));
  // Once launched, the Audience tab shows the frozen enrollment snapshot (who
  // was actually enrolled at launch), never a live re-resolve of the segment —
  // otherwise leads added to the segment afterward would appear to have joined
  // a campaign that never actually sent to them. Pre-launch (no enrollments
  // yet), the live segment/workspace membership is the correct preview.
  const audienceLeads = enrolledLeads ?? (campaign.segment_id ? await getSegmentMemberLeads(campaign.segment_id) : allLeads);

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
      owners={owners}
    />
  );
}
