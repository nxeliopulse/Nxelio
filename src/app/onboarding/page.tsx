import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { syncOutreachAccounts } from "@/lib/queries/outreach-accounts";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { OnboardingConnectResult } from "@/components/onboarding/onboarding-connect-result";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connect_error?: string; calendar_error?: string }>;
}) {
  const sp = await searchParams;

  if (sp.connected || sp.connect_error || sp.calendar_error) {
    if (sp.connected === "email" || sp.connected === "linkedin") await syncOutreachAccounts();
    return <OnboardingConnectResult connected={sp.connected} error={sp.calendar_error || (sp.connect_error ? "Couldn't connect. Please try again." : undefined)} />;
  }

  const status = await getOnboardingStatus();
  return <OnboardingWizard status={status} />;
}
