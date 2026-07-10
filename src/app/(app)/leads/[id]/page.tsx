import { notFound } from "next/navigation";
import { getLeads, getLeadStats } from "@/lib/queries/leads";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import { LeadsTable } from "@/components/leads/leads-table";

// Direct-link/bookmark support for a single lead: renders the same leads table as
// /leads, with that lead's detail sidebar pre-opened (see leads-table.tsx).
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [leads, stats, { lead, activities }] = await Promise.all([getLeads(), getLeadStats(), getLeadDetail(id)]);
  if (!lead) notFound();
  return (
    <LeadsTable
      leads={leads}
      stats={stats}
      initialSelectedLead={{ lead, activities }}
    />
  );
}
