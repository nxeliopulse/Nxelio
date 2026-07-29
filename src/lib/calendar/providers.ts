import "server-only";
import { calendarConfig, redirectUri, type CalProvider } from "./config";
export type { CalProvider };

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
  scope?: string;
}

export interface BusyInterval { start: string; end: string }

export interface ExternalCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

// Read-only calendar for availability sync, plus calendar.events (write) so we can
// create a real per-meeting Google Meet room via the Calendar API. offline_access (MS) /
// access_type=offline (Google) are what earn us a refresh token so this keeps working
// without re-login. Accounts connected before calendar.events was added must reconnect —
// Google/Microsoft only grant scopes present at consent time.
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const MS_SCOPE = "openid email offline_access https://graph.microsoft.com/Calendars.Read";

const TOKEN_URL: Record<CalProvider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

/** Build the provider's OAuth consent URL. */
export function buildAuthUrl(provider: CalProvider, state: string): string {
  const cfg = calendarConfig[provider];
  const redirect = redirectUri(provider);
  if (provider === "google") {
    const p = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirect,
    response_type: "code",
    response_mode: "query",
    scope: MS_SCOPE,
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;
}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
  }
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

function toTokenSet(d: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }): TokenSet {
  // Expire 60s early so a token is never used right as it lapses.
  const expiresAt = new Date(Date.now() + Math.max(0, (d.expires_in || 3600) - 60) * 1000).toISOString();
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt, scope: d.scope };
}

export async function exchangeCode(provider: CalProvider, code: string): Promise<TokenSet> {
  const cfg = calendarConfig[provider];
  const d = await postForm(TOKEN_URL[provider], {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(provider),
    ...(provider === "microsoft" ? { scope: MS_SCOPE } : {}),
  });
  return toTokenSet(d);
}

export async function refreshAccessToken(provider: CalProvider, refreshToken: string): Promise<TokenSet> {
  const cfg = calendarConfig[provider];
  const d = await postForm(TOKEN_URL[provider], {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    ...(provider === "microsoft" ? { scope: MS_SCOPE } : {}),
  });
  return toTokenSet(d);
}

/** Resolve the connected account's email (for display + Graph getSchedule). */
export async function fetchAccountEmail(provider: CalProvider, accessToken: string): Promise<string | null> {
  if (provider === "google") {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await res.json().catch(() => ({}));
    return d.email || null;
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await res.json().catch(() => ({}));
  return d.mail || d.userPrincipalName || null;
}

/** Fetch busy intervals between two ISO timestamps from the connected calendar. */
export async function fetchBusy(
  provider: CalProvider,
  accessToken: string,
  email: string | null,
  startIso: string,
  endIso: string
): Promise<BusyInterval[]> {
  if (provider === "google") {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: [{ id: "primary" }] }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error?.message || `Google freeBusy failed (${res.status})`);
    const cals = (d.calendars || {}) as Record<string, { busy?: BusyInterval[] }>;
    const primary = cals.primary || Object.values(cals)[0];
    return (primary?.busy || []).map((b) => ({ start: b.start, end: b.end }));
  }
  // Microsoft Graph getSchedule needs the mailbox address.
  if (!email) throw new Error("Microsoft calendar has no mailbox address; please reconnect");
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      schedules: [email],
      startTime: { dateTime: startIso, timeZone: "UTC" },
      endTime: { dateTime: endIso, timeZone: "UTC" },
      availabilityViewInterval: 30,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Graph getSchedule failed (${res.status})`);
  const sched = (d.value || [])[0] as { scheduleItems?: { status?: string; start?: { dateTime: string }; end?: { dateTime: string } }[] } | undefined;
  return (sched?.scheduleItems || [])
    .filter((it) => it.status && it.status !== "free")
    .map((it) => ({ start: it.start?.dateTime || "", end: it.end?.dateTime || "" }))
    .filter((b) => b.start && b.end);
}

/** Fetch actual titled events (not just busy blocks) so the app calendar can mirror the real one. */
export async function fetchEvents(
  provider: CalProvider,
  accessToken: string,
  email: string | null,
  startIso: string,
  endIso: string
): Promise<ExternalCalendarEvent[]> {
  if (provider === "google") {
    const p = new URLSearchParams({
      timeMin: startIso,
      timeMax: endIso,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error?.message || `Google events failed (${res.status})`);
    interface GEvent { id: string; summary?: string; status?: string; htmlLink?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }
    return ((d.items || []) as GEvent[])
      .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
      .map((e) => ({
        id: e.id,
        title: e.summary || "(No title)",
        start: e.start?.dateTime || `${e.start?.date}T00:00:00`,
        end: e.end?.dateTime || `${e.end?.date}T00:00:00`,
        allDay: Boolean(e.start?.date && !e.start?.dateTime),
        htmlLink: e.htmlLink || null,
      }));
  }
  // Microsoft Graph calendarView returns real events (title, times) for the mailbox.
  if (!email) throw new Error("Microsoft calendar has no mailbox address; please reconnect");
  const p = new URLSearchParams({ startDateTime: startIso, endDateTime: endIso, $top: "250" });
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Graph calendarView failed (${res.status})`);
  interface MSEvent { id: string; subject?: string; isCancelled?: boolean; webLink?: string; isAllDay?: boolean; start?: { dateTime?: string }; end?: { dateTime?: string } }
  return ((d.value || []) as MSEvent[])
    .filter((e) => !e.isCancelled && e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: e.id,
      title: e.subject || "(No title)",
      start: `${e.start!.dateTime}Z`,
      end: `${e.end!.dateTime}Z`,
      allDay: Boolean(e.isAllDay),
      htmlLink: e.webLink || null,
    }));
}

export interface CreateMeetEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmails?: string[];
}

export interface CreateMeetEventResult {
  joinUrl: string;
  htmlLink: string;
  eventId: string;
}

/**
 * Creates a real Google Calendar event with a Google Meet room attached
 * (conferenceDataVersion=1 asks the API to provision one) and returns its
 * stable join URL — the same URL for every attendee, unlike meet.google.com/new.
 */
export async function createMeetEvent(accessToken: string, input: CreateMeetEventInput): Promise<CreateMeetEventResult> {
  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    attendees: (input.attendeeEmails || []).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Google Calendar event creation failed (${res.status})`);
  const entryPoints = (d.conferenceData?.entryPoints || []) as { entryPointType?: string; uri?: string }[];
  const joinUrl = entryPoints.find((e) => e.entryPointType === "video")?.uri;
  if (!joinUrl) throw new Error("Google didn't return a Meet link for this event");
  return { joinUrl, htmlLink: d.htmlLink || "", eventId: d.id };
}
