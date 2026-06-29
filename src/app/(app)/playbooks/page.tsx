import { PlaybooksView } from "@/components/playbooks/playbooks-view";
import { getOnboarding } from "@/lib/queries/onboarding";

export default async function PlaybooksPage() {
  const { data } = await getOnboarding();
  const goals = data?.goals ?? [];
  return <PlaybooksView goals={goals} />;
}
