import { getCurrentUserProfile } from "@/lib/queries/users";
import { getEmailDomainStatus } from "@/lib/queries/integrations";
import { getBlocklist } from "@/lib/queries/blocklist";
import { getCalendarAccounts, getCalendarProviderStatus } from "@/lib/queries/calendar-accounts";
import { getZoomAccounts, getZoomProviderStatus } from "@/lib/queries/zoom-accounts";
import { getOutreachAccounts, isUnipileConfigured } from "@/lib/queries/outreach-accounts";
import { getHubspotAccount, getHubspotProviderStatus } from "@/lib/queries/hubspot-accounts";
import { getCurrentWorkspace } from "@/lib/queries/workspaces";
import { getAuditLog } from "@/lib/queries/audit-log";
import { getSendLimit } from "@/lib/queries/outreach-send-limits";
import { getOnboarding } from "@/lib/queries/onboarding";
import { getCompanyScore } from "@/lib/queries/company-score";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const [profile, emailDomain, blocklist, calendarAccounts, calendarProviderStatus, zoomAccounts, zoomProviderConfigured, outreachAccounts, unipileConfigured, workspace, emailSendLimit, linkedinSendLimit, hubspotAccount, hubspotProviderConfigured, onboarding, companyScore] = await Promise.all([
    getCurrentUserProfile(),
    getEmailDomainStatus(),
    getBlocklist(),
    getCalendarAccounts(),
    getCalendarProviderStatus(),
    getZoomAccounts(),
    getZoomProviderStatus(),
    getOutreachAccounts(),
    isUnipileConfigured(),
    getCurrentWorkspace(),
    getSendLimit("email"),
    getSendLimit("linkedin"),
    getHubspotAccount(),
    getHubspotProviderStatus(),
    getOnboarding(),
    getCompanyScore(),
  ]);
  const mailboxAccounts = outreachAccounts.filter((a) => a.channel === "email");
  const linkedinAccounts = outreachAccounts.filter((a) => a.channel === "linkedin");
  const p = profile as { role_id?: number | null; roles?: { role_name?: string } | null } | null;
  const isSuperAdmin = p?.roles?.role_name === "Super Admin" || p?.role_id === 1;
  const auditLog = isSuperAdmin ? await getAuditLog().catch(() => []) : [];
  return (
    <SettingsView
      profile={profile}
      emailDomain={emailDomain}
      blocklist={blocklist}
      calendarAccounts={calendarAccounts}
      calendarProviderStatus={calendarProviderStatus}
      zoomAccounts={zoomAccounts}
      zoomConfigured={zoomProviderConfigured}
      mailboxAccounts={mailboxAccounts}
      linkedinAccounts={linkedinAccounts}
      unipileConfigured={unipileConfigured}
      bookingSlug={workspace?.capture_slug ?? null}
      isSuperAdmin={isSuperAdmin}
      auditLog={auditLog}
      emailSendLimit={emailSendLimit}
      linkedinSendLimit={linkedinSendLimit}
      hubspotAccount={hubspotAccount}
      hubspotProviderConfigured={hubspotProviderConfigured}
      business={onboarding.data}
      companyScore={companyScore}
    />
  );
}
