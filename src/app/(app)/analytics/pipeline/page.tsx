import { getUsers } from "@/lib/queries/users";
import { getPipelineAnalytics, type PipelineFilters } from "@/lib/queries/analytics-pipeline";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import type { OpportunityStage } from "@/lib/opportunities";
import { PipelineView } from "@/components/analytics/pipeline/pipeline-view";

export default async function AnalyticsPipelinePage({ searchParams }: { searchParams: Promise<{ stage?: string; owner?: string }> }) {
  const sp = await searchParams;
  const filters: PipelineFilters = { stage: sp.stage as OpportunityStage | undefined, owner: sp.owner };
  const [data, ctx, users] = await Promise.all([getPipelineAnalytics(filters), getAnalyticsContext(), getUsers()]);
  return (
    <PipelineView
      data={data}
      filters={filters}
      showTeamFilter={ctx.directReportIds.length > 0}
      ownerNames={Object.fromEntries(users.map((u) => [u.user_id, u.full_name]))}
    />
  );
}
