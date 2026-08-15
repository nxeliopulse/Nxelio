import { getTeamAnalytics } from "@/lib/queries/analytics-team";
import { TeamView } from "@/components/analytics/team/team-view";

export default async function AnalyticsTeamPage() {
  const data = await getTeamAnalytics();
  return <TeamView data={data} />;
}
