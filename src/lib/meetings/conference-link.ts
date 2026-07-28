/**
 * Generates a meeting link for the selected conferencing app.
 *
 * "Video Call" uses Jitsi Meet: a slug is generated once per meeting and
 * stored on the meeting row, so every join (host or lead) opens the exact
 * same URL and lands in the same room. This deliberately avoids
 * meet.google.com/new and Teams' "new meeting" deep link — both mint a
 * brand-new random room every time they're opened, so a host and a lead
 * opening the "same" link at different times end up in two different rooms.
 * Real per-meeting Google Meet/Teams rooms require Calendar API OAuth
 * (Google Calendar read-only OAuth already exists in src/lib/calendar for
 * availability sync; creating events with conferencing would need a write
 * scope added) — a bigger integration, not this fix.
 */
export type ConferenceProvider = "google_meet" | "teams" | "webex" | "manual";

export const CONFERENCE_PROVIDERS: { value: ConferenceProvider; label: string }[] = [
  { value: "google_meet", label: "Video Call" },
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
      return `https://meet.jit.si/Nxelio-${slug()}`;
    case "teams":
      return `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(subject || "Meeting")}`;
    case "webex":
      return `https://web.webex.com/meet/${slug()}`;
    default:
      return "";
  }
}
