import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getCampaignRecipients } from "@/lib/queries/campaigns";
import { getUsers } from "@/lib/queries/users";
import { hasReadyLeadSearchJobs, listLeadSearchJobs } from "@/lib/leads/lead-search-jobs";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ campaign?: string; q?: string; filter?: string; status?: string }> }) {
  const { campaign, q, filter, status } = await searchParams;
  const [leads, stats, users, hasReadyVerifiedLeads, searchJobs] = await Promise.all([
    getLeads(), getLeadStats(), getUsers(), hasReadyLeadSearchJobs(), listLeadSearchJobs(),
  ]);
  const owners = Object.fromEntries(users.map((u) => [u.user_id, u.full_name]));

  const rawFilter = (filter || status || "").toLowerCase();
  const initialQuickFilter =
    rawFilter.includes("qual") ? ("qualified" as const)
    : rawFilter.includes("hot") ? ("hot" as const)
    : rawFilter.includes("follow") ? ("followup" as const)
    : rawFilter.includes("new") ? ("new" as const)
    : undefined;

  // When opened from a campaign's "View report", show just that campaign's recipients.
  if (campaign) {
    const { name, leadIds } = await getCampaignRecipients(campaign);
    const idSet = new Set(leadIds);
    const filtered = leads.filter((l) => idSet.has(l.id));
    return <LeadsTable leads={filtered} stats={stats} campaignFilter={{ id: campaign, name: name || "Campaign" }} initialQuickFilter={initialQuickFilter} owners={owners} hasReadyVerifiedLeads={hasReadyVerifiedLeads} searchJobs={searchJobs} />;
  }

  return <LeadsTable leads={leads} stats={stats} initialSearch={q} initialQuickFilter={initialQuickFilter} owners={owners} hasReadyVerifiedLeads={hasReadyVerifiedLeads} searchJobs={searchJobs} />;
}
