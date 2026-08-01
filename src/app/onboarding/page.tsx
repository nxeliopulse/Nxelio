import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getCalendarProviderStatus, getCalendarAccounts } from "@/lib/queries/calendar-accounts";
import { getZoomProviderStatus, getZoomAccounts } from "@/lib/queries/zoom-accounts";
import { syncOutreachAccounts } from "@/lib/queries/outreach-accounts";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { OnboardingConnectResult } from "@/components/onboarding/onboarding-connect-result";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connect_error?: string; calendar_error?: string }>;
}) {
  const sp = await searchParams;

  // Every connect flow (mailbox, Zoom, Calendar) returns here in whatever tab
  // it was opened in (usually a popup) — if that's THIS tab, show a small
  // confirmation instead of the full wizard. Rendering the wizard here used to
  // reset straight to step 1 (nothing is saved in this tab's session), which
  // is what made it look like connecting an integration wiped all progress.
  if (sp.connected || sp.connect_error || sp.calendar_error) {
    // Email/Unipile connections land here without ever hitting one of our own
    // routes — this is the only place that persists them, so do it before
    // rendering the confirmation.
    if (sp.connected === "email") await syncOutreachAccounts();
    return <OnboardingConnectResult connected={sp.connected} error={sp.calendar_error || (sp.connect_error ? "Couldn't connect. Please try again." : undefined)} />;
  }

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
