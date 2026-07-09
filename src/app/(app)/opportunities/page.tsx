import { getOpportunities, getPipelineStats } from "@/lib/queries/opportunities";
import { PipelineBoard } from "@/components/opportunities/pipeline-board";
import { hasFeature } from "@/lib/queries/subscriptions";
import { LockedFeature } from "@/components/billing/locked-feature";

export default async function OpportunitiesPage() {
  if (!(await hasFeature("opportunities"))) return <LockedFeature feature="Opportunities" />;
  const [opportunities, stats] = await Promise.all([getOpportunities(), getPipelineStats()]);
  return <PipelineBoard initial={opportunities} stats={stats} />;
}
