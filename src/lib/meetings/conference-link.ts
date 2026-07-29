/**
 * Fallback meeting link generator — used only when the real per-provider API
 * integration isn't available (no connected account for that provider). The
 * real paths are:
 *   - src/lib/queries/calendar-accounts.ts#createGoogleMeetLink — creates an
 *     actual Calendar event via the connected Google account, returns its
 *     stable hangoutLink.
 *   - src/lib/queries/zoom-accounts.ts#createZoomMeetingLink — creates an
 *     actual Zoom meeting via the connected Zoom account, returns its stable
 *     join_url.
 *
 * The fallback below deliberately avoids meet.google.com/new — it mints a
 * brand-new random room every time it's opened, so a host and a lead opening
 * the "same" link at different times would land in two different rooms.
 * Instead it generates a Jitsi Meet slug once per meeting, stored on the
 * meeting row, so every join (host or lead) opens the exact same URL and room.
 */
export type ConferenceProvider = "google_meet" | "zoom" | "manual";

export const CONFERENCE_PROVIDERS: { value: ConferenceProvider; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "zoom", label: "Zoom" },
];

function slug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz0123456789";
  const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part(3)}-${part(4)}-${part(3)}`;
}

export function generateConferenceLink(provider: ConferenceProvider): string {
  switch (provider) {
    case "google_meet":
    case "zoom":
      return `https://meet.jit.si/Nxelio-${slug()}`;
    default:
      return "";
  }
}
