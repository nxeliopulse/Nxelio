import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getCampaignRecipients } from "@/lib/queries/campaigns";
import { getAiColumns, getAiColumnSavedTemplates } from "@/lib/queries/ai-columns";
import { getUsers } from "@/lib/queries/users";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ campaign?: string; q?: string }> }) {
  const { campaign, q } = await searchParams;
  const [leads, stats, aiColumns, aiColumnSavedTemplates, users] = await Promise.all([getLeads(), getLeadStats(), getAiColumns(), getAiColumnSavedTemplates(), getUsers()]);
  const owners = Object.fromEntries(users.map((u) => [u.user_id, u.full_name]));

  // When opened from a campaign's "View report", show just that campaign's recipients.
  if (campaign) {
    const { name, leadIds } = await getCampaignRecipients(campaign);
    const idSet = new Set(leadIds);
    const filtered = leads.filter((l) => idSet.has(l.id));
    return <LeadsTable leads={filtered} stats={stats} campaignFilter={{ id: campaign, name: name || "Campaign" }} aiColumns={aiColumns} aiColumnSavedTemplates={aiColumnSavedTemplates} owners={owners} />;
  }

  return <LeadsTable leads={leads} stats={stats} initialSearch={q} aiColumns={aiColumns} aiColumnSavedTemplates={aiColumnSavedTemplates} owners={owners} />;
}
