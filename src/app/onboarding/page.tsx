import { redirect } from "next/navigation";
import { getOnboarding } from "@/lib/queries/onboarding";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const { completed } = await getOnboarding();
  if (completed) redirect("/dashboard");
  return <OnboardingWizard />;
}
