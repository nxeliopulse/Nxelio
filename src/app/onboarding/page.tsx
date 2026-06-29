import { getOnboarding } from "@/lib/queries/onboarding";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  // Preload any saved details so this doubles as an edit screen. Onboarding is
  // soft (the app layout only shows a banner, no hard gate), so we don't redirect
  // completed users away — they can return here to review or change their answers.
  const { data, completed } = await getOnboarding();
  return <OnboardingWizard initial={data} isEdit={completed} />;
}
