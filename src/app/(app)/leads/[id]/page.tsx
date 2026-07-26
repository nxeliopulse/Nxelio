import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import { LeadDetailView } from "@/components/leads/lead-detail-view";

// A full standalone page for one lead (direct-link/bookmark support) — mirrors
// how campaign-detail-view.tsx renders one campaign's own page rather than an
// overlay on the campaigns list.
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lead, activities, opportunities, meetings, history, notes, campaigns } = await getLeadDetail(id);
  if (!lead) notFound();
  return (
    <LeadDetailView
      lead={lead}
      activities={activities}
      opportunities={opportunities}
      meetings={meetings}
      history={history}
      notes={notes}
      campaigns={campaigns}
    />
  );
}
