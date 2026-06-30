import "server-only";

export type CalProvider = "google" | "microsoft";

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const calendarConfig = {
  google: {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
  },
  microsoft: {
    clientId: process.env.MS_CALENDAR_CLIENT_ID || "",
    clientSecret: process.env.MS_CALENDAR_CLIENT_SECRET || "",
  },
} as const;

/** True when this provider has OAuth credentials configured. */
export function calendarConfigured(p: CalProvider): boolean {
  return Boolean(calendarConfig[p].clientId && calendarConfig[p].clientSecret);
}

/** OAuth redirect URI for a provider — must match what's registered with Google/Azure. */
export function redirectUri(p: CalProvider): string {
  return `${appUrl()}/api/calendar/${p}/callback`;
}
