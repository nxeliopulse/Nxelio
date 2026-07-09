import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getCampaignRecipients } from "@/lib/queries/campaigns";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ campaign?: string; q?: string }> }) {
  const { campaign, q } = await searchParams;
  const [leads, stats] = await Promise.all([getLeads(), getLeadStats()]);

  // When opened from a campaign's "View report", show just that campaign's recipients.
  if (campaign) {
    const { name, leadIds } = await getCampaignRecipients(campaign);
    const idSet = new Set(leadIds);
    const filtered = leads.filter((l) => idSet.has(l.id));
    return <LeadsTable leads={filtered} stats={stats} campaignFilter={{ id: campaign, name: name || "Campaign" }} />;
  }

  return <LeadsTable leads={leads} stats={stats} initialSearch={q} />;
}
