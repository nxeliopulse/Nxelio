import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import { LeadDetailView } from "@/components/leads/lead-detail-view";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lead, activities } = await getLeadDetail(id);
  if (!lead) notFound();
  return <LeadDetailView lead={lead} activities={activities} />;
}
