import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPendingCount, getCampaignRecipients } from "@/lib/queries/campaigns";
import { getSegments } from "@/lib/queries/segments";
import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getInboxConversations } from "@/lib/queries/inbox";
import { getCampaignLeadActivity } from "@/lib/email/campaign-stats";
import { CampaignDetailView } from "@/components/campaigns/campaign-detail-view";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, segments, leadStats, pending, inboxConversations, allLeads, recipients, leadActivity] = await Promise.all([
    getCampaignById(id),
    getSegments(),
    getLeadStats(),
    getCampaignPendingCount(id),
    getInboxConversations(id),
    getLeads(),
    getCampaignRecipients(id),
    getCampaignLeadActivity(id),
  ]);
  if (!campaign) notFound();

  const seg = campaign.segment_id ? segments.find((s) => s.id === campaign.segment_id) : null;
  const audience = seg ? seg.contacts : leadStats.total;
  const audienceLabel = seg ? seg.segment_name : "All leads";
  const recipientIds = new Set(recipients.leadIds);
  const audienceLeads = allLeads.filter((l) => recipientIds.has(l.id));

  return (
    <CampaignDetailView
      campaign={campaign}
      audience={audience}
      audienceLabel={audienceLabel}
      pendingJobs={pending}
      inboxConversations={inboxConversations}
      audienceLeads={audienceLeads}
      leadActivity={leadActivity}
    />
  );
}
