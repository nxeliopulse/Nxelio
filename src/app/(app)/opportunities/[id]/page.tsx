import { notFound } from "next/navigation";
import { getOpportunityById, getAdjacentOpportunityIds } from "@/lib/queries/opportunities";
import { getAccountById } from "@/lib/queries/accounts";
import { getLeadById } from "@/lib/queries/leads";
import { getUsers } from "@/lib/queries/users";
import { OpportunityDetailView } from "@/components/opportunities/opportunity-detail-view";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await getOpportunityById(id);
  if (!opportunity) notFound();

  const [account, { prevId, nextId }, users, originatingLead] = await Promise.all([
    opportunity.account_id ? getAccountById(opportunity.account_id) : Promise.resolve(null),
    getAdjacentOpportunityIds(id),
    getUsers(),
    opportunity.lead_id ? getLeadById(opportunity.lead_id) : Promise.resolve(null),
  ]);

  const owner = users.find((u) => u.user_id === opportunity.owner_id) || null;

  return (
    <OpportunityDetailView
      opportunity={opportunity}
      account={account}
      ownerName={owner?.full_name || null}
      leadSource={originatingLead?.source || null}
      prevId={prevId}
      nextId={nextId}
    />
  );
}
