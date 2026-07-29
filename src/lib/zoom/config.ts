import "server-only";
import { appUrl } from "@/lib/calendar/config";

export const zoomConfig = {
  clientId: process.env.ZOOM_CLIENT_ID || "",
  clientSecret: process.env.ZOOM_CLIENT_SECRET || "",
};

/** True when Zoom OAuth credentials are configured — drives the connect UI. */
export function zoomConfigured(): boolean {
  return Boolean(zoomConfig.clientId && zoomConfig.clientSecret);
}

/** OAuth redirect URI — must match what's registered in the Zoom OAuth app. */
export function zoomRedirectUri(): string {
  return `${appUrl()}/api/zoom/callback`;
}
