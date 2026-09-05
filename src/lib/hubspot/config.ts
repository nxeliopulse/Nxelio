import "server-only";
import { appUrl } from "@/lib/calendar/config";

export const hubspotConfig = {
  clientId: process.env.HUBSPOT_CLIENT_ID || "",
  clientSecret: process.env.HUBSPOT_CLIENT_SECRET || "",
};

/** True when HubSpot OAuth app credentials are configured — drives the connect UI. */
export function hubspotAppConfigured(): boolean {
  return Boolean(hubspotConfig.clientId && hubspotConfig.clientSecret);
}

/** OAuth redirect URI — must match what's registered in the HubSpot public app. */
export function hubspotRedirectUri(): string {
  return `${appUrl()}/api/hubspot/callback`;
}
