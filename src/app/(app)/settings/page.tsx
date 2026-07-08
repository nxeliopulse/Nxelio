import { getCurrentUserProfile } from "@/lib/queries/users";
import { getIntegrationStatuses, getEmailDomainStatus } from "@/lib/queries/integrations";
import { getBlocklist } from "@/lib/queries/blocklist";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const [profile, integrations, emailDomain, blocklist] = await Promise.all([
    getCurrentUserProfile(),
    getIntegrationStatuses(),
    getEmailDomainStatus(),
    getBlocklist(),
  ]);
  return (
    <SettingsView
      profile={profile}
      integrations={integrations}
      emailDomain={emailDomain}
      blocklist={blocklist}
    />
  );
}
