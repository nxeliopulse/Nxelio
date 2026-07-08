import { getCampaigns, getCampaignStats } from "@/lib/queries/campaigns";
import { getSequences, getSequenceStats } from "@/lib/queries/outreach";
import { CampaignsView } from "@/components/campaigns/campaigns-view";

export default async function CampaignsPage() {
  const [campaigns, cStats, sequences, sStats] = await Promise.all([
    getCampaigns(),
    getCampaignStats(),
    getSequences(),
    getSequenceStats(),
  ]);

  return (
    <CampaignsView
      campaigns={campaigns}
      sequences={sequences}
      cStats={cStats}
      sStats={sStats}
    />
  );
}
