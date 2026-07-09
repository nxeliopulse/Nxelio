import { getCampaigns, getCampaignStats } from "@/lib/queries/campaigns";
import { getSequences, getSequenceStats } from "@/lib/queries/outreach";
import { getSegments } from "@/lib/queries/segments";
import { getLeadStats } from "@/lib/queries/leads";
import { getUsers } from "@/lib/queries/users";
import { isCurrentUserApprover } from "@/lib/queries/campaign-approval";
import { CampaignsView } from "@/components/campaigns/campaigns-view";

export default async function CampaignsPage() {
  const [campaigns, cStats, sequences, sStats, isApprover, segments, leadStats, users] = await Promise.all([
    getCampaigns(),
    getCampaignStats(),
    getSequences(),
    getSequenceStats(),
    isCurrentUserApprover(),
    getSegments(),
    getLeadStats(),
    getUsers(),
  ]);
  const owners = Object.fromEntries(users.map((u) => [u.user_id, u.full_name]));

  return (
    <CampaignsView
      campaigns={campaigns}
      sequences={sequences}
      cStats={cStats}
      sStats={sStats}
      isApprover={isApprover}
      segments={segments}
      totalLeads={leadStats.total}
      owners={owners}
    />
  );
}
