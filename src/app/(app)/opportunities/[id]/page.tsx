import { notFound } from "next/navigation";
import { getOpportunityById } from "@/lib/queries/opportunities";
import { OpportunityDetailView } from "@/components/opportunities/opportunity-detail-view";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await getOpportunityById(id);
  if (!opportunity) notFound();
  return <OpportunityDetailView opportunity={opportunity} />;
}
