import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPendingCount, getCampaigns } from "@/lib/queries/campaigns";
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
  const [campaign, segments, leadStats, pending, inboxConversations, allLeads, leadActivity, replyTrackingEnabled, users, enrolledLeads, allCampaigns] = await Promise.all([
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
    getCampaigns(),
  ]);
  if (!campaign) notFound();

  const seg = campaign.segment_id ? segments.find((s) => s.id === campaign.segment_id) : null;
  const audienceLabel = seg ? seg.segment_name : "All leads";
  const owners = Object.fromEntries(users.map((u) => [u.user_id, u.full_name]));
  const launched = campaign.status !== "Draft" && !!enrolledLeads;
  const liveMatched = campaign.segment_id ? await getSegmentMemberLeads(campaign.segment_id) : allLeads;
  // Pre-launch: just the live segment/workspace membership (nothing's frozen yet).
  // Post-launch (split-and-send may have excluded some of the matched set):
  // show the FULL matched set so excluded prospects are still visible and
  // explainable, not silently hidden — but mark which ones actually got
  // enrolled (enrolledLeadIds, passed to the table for bright/dulled styling)
  // so it's obvious who this campaign really reached vs who was excluded.
  // Matched leads that only showed up in the segment AFTER launch (never
  // enrolled) appear dulled too — correctly, since they were never sent to.
  const audienceLeads = launched
    ? [...enrolledLeads!, ...liveMatched.filter((l) => !enrolledLeads!.some((e) => e.id === l.id))]
    : liveMatched;
  const enrolledLeadIds = launched ? new Set(enrolledLeads!.map((l) => l.id)) : null;
  // "Audience" must count who this campaign actually reached (or a
  // split-and-send subset of the matched segment), never the raw segment
  // size — otherwise Analytics/the progress bar disagree with the Audience
  // tab (e.g. "5 in the segment" when only 1 was ever actually enrolled).
  const audience = launched ? enrolledLeads!.length : (seg ? seg.contacts : leadStats.total);

  return (
    <CampaignDetailView
      campaign={campaign}
      audience={audience}
      audienceLabel={audienceLabel}
      pendingJobs={pending}
      inboxConversations={inboxConversations}
      audienceLeads={audienceLeads}
      enrolledLeadIds={enrolledLeadIds}
      leadActivity={leadActivity}
      replyTrackingEnabled={replyTrackingEnabled}
      owners={owners}
      segments={segments}
      campaigns={allCampaigns}
      leadStatsTotal={leadStats.total}
    />
  );
}
