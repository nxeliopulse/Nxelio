import { getOpportunities, getPipelineStats } from "@/lib/queries/opportunities";
import { OpportunitiesTable } from "@/components/opportunities/opportunities-table";
import { hasFeature } from "@/lib/queries/subscriptions";
import { LockedFeature } from "@/components/billing/locked-feature";

export default async function OpportunitiesPage() {
  if (!(await hasFeature("opportunities"))) return <LockedFeature feature="Opportunities" plan="Starter" />;
  const [opportunities, stats] = await Promise.all([getOpportunities(), getPipelineStats()]);
  return <OpportunitiesTable initial={opportunities} stats={stats} />;
}
