import { getCurrentUserProfile } from "@/lib/queries/users";
import { getIntegrationStatuses, getEmailDomainStatus } from "@/lib/queries/integrations";
import { getBlocklist } from "@/lib/queries/blocklist";
import { getCalendarAccounts, getCalendarProviderStatus } from "@/lib/queries/calendar-accounts";
import { getOutreachAccounts, isUnipileConfigured } from "@/lib/queries/outreach-accounts";
import { getCurrentWorkspace } from "@/lib/queries/workspaces";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const [profile, integrations, emailDomain, blocklist, calendarAccounts, calendarProviderStatus, outreachAccounts, unipileConfigured, workspace] = await Promise.all([
    getCurrentUserProfile(),
    getIntegrationStatuses(),
    getEmailDomainStatus(),
    getBlocklist(),
    getCalendarAccounts(),
    getCalendarProviderStatus(),
    getOutreachAccounts(),
    isUnipileConfigured(),
    getCurrentWorkspace(),
  ]);
  const mailboxAccounts = outreachAccounts.filter((a) => a.channel === "email");
  const linkedinAccounts = outreachAccounts.filter((a) => a.channel === "linkedin");
  const p = profile as { role_id?: number | null; roles?: { role_name?: string } | null } | null;
  const isSuperAdmin = p?.roles?.role_name === "Super Admin" || p?.role_id === 1;
  return (
    <SettingsView
      profile={profile}
      integrations={integrations}
      emailDomain={emailDomain}
      blocklist={blocklist}
      calendarAccounts={calendarAccounts}
      calendarProviderStatus={calendarProviderStatus}
      mailboxAccounts={mailboxAccounts}
      linkedinAccounts={linkedinAccounts}
      unipileConfigured={unipileConfigured}
      bookingSlug={workspace?.capture_slug ?? null}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
