/**
 * Generates a meeting link for the selected conferencing app.
 *
 * NOTE: full API integration (real per-meeting rooms via Google Meet / Teams /
 * Webex) is pending the client's OAuth credentials. Until then we use each
 * provider's official "start a new meeting" entry point — these are real,
 * working links, just not pre-provisioned rooms:
 *   - Google Meet → meet.google.com/new spins up a fresh meeting on open
 *   - Teams       → the documented "new meeting" deep link
 *   - Webex       → a personal-room-style link (placeholder slug until API)
 * When the integration lands, swap generateConferenceLink for the API call.
 */
export type ConferenceProvider = "google_meet" | "teams" | "webex" | "manual";

export const CONFERENCE_PROVIDERS: { value: ConferenceProvider; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "webex", label: "Webex" },
];

function slug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz0123456789";
  const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part(3)}-${part(4)}-${part(3)}`;
}

export function generateConferenceLink(provider: ConferenceProvider, subject?: string): string {
  switch (provider) {
    case "google_meet":
      return "https://meet.google.com/new";
    case "teams":
      return `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(subject || "Meeting")}`;
    case "webex":
      return `https://web.webex.com/meet/${slug()}`;
    default:
      return "";
  }
}
