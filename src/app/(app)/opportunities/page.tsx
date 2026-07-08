import { getOpportunities, getPipelineStats } from "@/lib/queries/opportunities";
import { PipelineBoard } from "@/components/opportunities/pipeline-board";

export default async function OpportunitiesPage() {
  const [opportunities, stats] = await Promise.all([getOpportunities(), getPipelineStats()]);
  return <PipelineBoard initial={opportunities} stats={stats} />;
}
