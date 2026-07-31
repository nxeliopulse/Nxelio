import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getCalendarProviderStatus, getCalendarAccounts } from "@/lib/queries/calendar-accounts";
import { getZoomProviderStatus, getZoomAccounts } from "@/lib/queries/zoom-accounts";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  // Completed workspaces can still return here to review/edit their answers
  // (OnboardingWizard treats status.completed as edit mode) — this is a hard
  // gate only for first-run, incomplete workspaces.
  const [status, calendarProviderStatus, calendarAccounts, zoomConfigured, zoomAccounts] = await Promise.all([
    getOnboardingStatus(),
    getCalendarProviderStatus(),
    getCalendarAccounts(),
    getZoomProviderStatus(),
    getZoomAccounts(),
  ]);
  return (
    <OnboardingWizard
      status={status}
      calendarProviderStatus={calendarProviderStatus}
      calendarConnected={calendarAccounts.length > 0}
      zoomConfigured={zoomConfigured}
      zoomConnected={zoomAccounts.length > 0}
    />
  );
}
