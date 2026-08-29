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

// Read-only calendar for availability sync, plus a write scope so we can create a real
// per-meeting room (Google Meet / Teams) via each provider's Calendar API. offline_access
// (MS) / access_type=offline (Google, Zoho) are what earn us a refresh token so this keeps
// working without re-login. Accounts connected before a write scope was added must
// reconnect — Google/Microsoft/Zoho only grant scopes present at consent time.
// NOTE: MS_SCOPE was bumped from Calendars.Read to Calendars.ReadWrite as part of fixing
// createMeetEvent's Microsoft branch (see below) — without write access, POSTing a new
// event to Graph would 403 regardless of how the request body is shaped. Any Microsoft
// calendar connected before this change must be reconnected to pick up the new scope.
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const MS_SCOPE = "openid email offline_access https://graph.microsoft.com/Calendars.ReadWrite";
// AaaServer.profile.READ is what lets fetchAccountEmail resolve the connected mailbox via
// accounts.zoho.com/oauth/user/info; the two ZohoCalendar scopes cover read + write.
const ZOHO_SCOPE = "ZohoCalendar.calendar.ALL,ZohoCalendar.event.ALL,AaaServer.profile.READ";

const TOKEN_URL: Record<CalProvider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  zoho: "https://accounts.zoho.com/oauth/v2/token",
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
  if (provider === "zoho") {
    const p = new URLSearchParams({
      scope: ZOHO_SCOPE,
      client_id: cfg.clientId,
      response_type: "code",
      redirect_uri: redirect,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    // Zoho's OAuth authorize endpoint is region-specific (accounts.zoho.com / .eu / .in /
    // .com.au / etc — whichever data center the business's Zoho org lives in). Default to
    // the global .com endpoint; a business on another Zoho region would need this endpoint
    // swapped for their region's accounts host. Not auto-detected.
    return `https://accounts.zoho.com/oauth/v2/auth?${p}`;
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
  if (provider === "zoho") {
    const res = await fetch("https://accounts.zoho.com/oauth/user/info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await res.json().catch(() => ({}));
    return d.Email || null;
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await res.json().catch(() => ({}));
  return d.mail || d.userPrincipalName || null;
}

// ---- Zoho Calendar helpers -------------------------------------------------
//
// Zoho Calendar doesn't expose a direct free/busy endpoint the way Google's
// freeBusy API does, so fetchBusy/fetchEvents/createMeetEvent all go through
// the events endpoint on the account's default calendar. All three need that
// calendar's UID first, and share the same event-list call and date-format
// conversion, so those are factored out here.
//
// IMPORTANT: this integration is written from Zoho's public API docs and
// cannot be exercised against a real Zoho account in this environment. The
// endpoint shapes below are correctness-by-inspection, not verified against
// a live response — see the report for exactly which parts that applies to.

/** Zoho Calendar API calls use the `Zoho-oauthtoken` auth scheme (not `Bearer`) — this is
 *  documented Zoho API convention, distinct from the accounts.zoho.com/oauth/user/info
 *  endpoint above, which is a generic OAuth-style userinfo endpoint that does accept Bearer. */
function zohoAuthHeader(accessToken: string): string {
  return `Zoho-oauthtoken ${accessToken}`;
}

/** Looks up the connected Zoho account's default (primary) calendar UID. No caching —
 *  this is a cheap list call and callers only need it once per request. */
async function resolveZohoDefaultCalendarUid(accessToken: string): Promise<string> {
  const res = await fetch("https://calendar.zoho.com/api/v1/calendars", {
    headers: { Authorization: zohoAuthHeader(accessToken) },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || d.summary || `Zoho calendars list failed (${res.status})`);
  interface ZCalendar { uid?: string; isdefault?: boolean }
  const cals = ((d.calendars || d.calendarlist || []) as ZCalendar[]);
  const primary = cals.find((c) => c.isdefault) || cals[0];
  if (!primary?.uid) throw new Error("Zoho account has no default calendar (or an unexpected /calendars response shape)");
  return primary.uid;
}

/** Converts an ISO timestamp to Zoho's "yyyyMMdd'T'HHmmss'Z'" range-param format. */
function toZohoDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for Zoho calendar request: ${iso}`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Best-effort reverse of toZohoDateTime for values coming back from Zoho — Zoho's docs
 *  describe event dateandtime fields in the same "yyyyMMddTHHmmssZ" shape. Throws a clear
 *  error instead of silently passing through a value we can't confidently parse, per this
 *  being a best-effort integration that can't be tested against a live Zoho account. */
function zohoDateTimeToIso(value: string | undefined): string {
  if (!value) throw new Error("Zoho event is missing a start/end date");
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (m) {
    const [, y, mo, da, h, mi, s] = m;
    return `${y}-${mo}-${da}T${h}:${mi}:${s}Z`;
  }
  // Already looks ISO-ish — trust it rather than mangling a shape we didn't anticipate.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value;
  throw new Error(`Unrecognized Zoho date format: ${JSON.stringify(value)}`);
}

interface ZohoRawEvent {
  uid?: string;
  eventid?: string;
  title?: string;
  status?: string;
  dateandtime?: { start?: string; end?: string; timezone?: string };
}

/** Shared by fetchBusy and fetchEvents: lists events on the default calendar within a
 *  range. Zoho's range param is a JSON-encoded string (not separate start/end query
 *  params) with values in Zoho's own datetime format, not ISO. */
async function fetchZohoRawEvents(accessToken: string, startIso: string, endIso: string): Promise<ZohoRawEvent[]> {
  const calendarUid = await resolveZohoDefaultCalendarUid(accessToken);
  const range = JSON.stringify({ start: toZohoDateTime(startIso), end: toZohoDateTime(endIso) });
  const p = new URLSearchParams({ range });
  const res = await fetch(`https://calendar.zoho.com/api/v1/calendars/${calendarUid}/events?${p}`, {
    headers: { Authorization: zohoAuthHeader(accessToken) },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || d.summary || `Zoho events list failed (${res.status})`);
  const events = d.events;
  if (!Array.isArray(events)) throw new Error("Zoho events response was in an unexpected shape (no events[] array)");
  return events as ZohoRawEvent[];
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
  if (provider === "zoho") {
    // No dedicated free/busy endpoint — treat every event on the default calendar in
    // range as a busy block. Any event that doesn't parse throws (see zohoDateTimeToIso)
    // rather than silently reporting the wrong availability.
    const raw = await fetchZohoRawEvents(accessToken, startIso, endIso);
    return raw
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        start: zohoDateTimeToIso(e.dateandtime?.start),
        end: zohoDateTimeToIso(e.dateandtime?.end),
      }));
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
  if (provider === "zoho") {
    const raw = await fetchZohoRawEvents(accessToken, startIso, endIso);
    return raw
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        id: e.uid || e.eventid || crypto.randomUUID(),
        title: e.title || "(No title)",
        start: zohoDateTimeToIso(e.dateandtime?.start),
        end: zohoDateTimeToIso(e.dateandtime?.end),
        // Zoho's docs don't clearly expose an all-day flag on this shape — best-effort default.
        allDay: false,
        // Zoho event objects don't consistently expose a direct web link.
        htmlLink: null,
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
 * Creates a real calendar event with a video-meeting room attached and returns its join
 * URL — Google gets a Google Meet room, Microsoft gets a Teams meeting; Zoho has no
 * equivalent native auto-generated room (see the zoho branch below for what that means
 * for its return value).
 */
export async function createMeetEvent(provider: CalProvider, accessToken: string, input: CreateMeetEventInput): Promise<CreateMeetEventResult> {
  if (provider === "microsoft") {
    // Microsoft Graph's documented way to auto-provision a Teams meeting on an event:
    // isOnlineMeeting + onlineMeetingProvider on creation, which comes back with an
    // onlineMeeting.joinUrl — no separate "create meeting" call needed.
    const body = {
      subject: input.summary,
      body: { contentType: "text", content: input.description || "" },
      start: { dateTime: input.startIso, timeZone: "UTC" },
      end: { dateTime: input.endIso, timeZone: "UTC" },
      attendees: (input.attendeeEmails || []).map((email) => ({ emailAddress: { address: email }, type: "required" })),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
    };
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error?.message || `Microsoft Calendar event creation failed (${res.status})`);
    const joinUrl = d.onlineMeeting?.joinUrl;
    if (!joinUrl) throw new Error("Microsoft didn't return a Teams join link for this event");
    return { joinUrl, htmlLink: d.webLink || "", eventId: d.id };
  }

  if (provider === "zoho") {
    // Zoho Calendar has no native auto-generated video-conferencing room the way Google
    // Meet / Teams do — there's no field to ask Zoho to provision one, and no join link
    // in the response to return. joinUrl: "" below is the deliberate signal for that: the
    // caller (createGoogleMeetLink* in calendar-accounts.ts) already falls back to a
    // placeholder link when joinUrl comes back empty, so this is not a bug to "fix" here.
    //
    // Best-effort: exact Zoho event-creation body shape isn't verified against a live
    // account (see fetchZohoRawEvents comment above for the same caveat).
    const calendarUid = await resolveZohoDefaultCalendarUid(accessToken);
    const body = {
      title: input.summary,
      description: input.description || "",
      dateandtime: {
        start: toZohoDateTime(input.startIso),
        end: toZohoDateTime(input.endIso),
        timezone: "UTC",
      },
      attendees: (input.attendeeEmails || []).map((email) => ({ email })),
    };
    const res = await fetch(`https://calendar.zoho.com/api/v1/calendars/${calendarUid}/events`, {
      method: "POST",
      headers: { Authorization: zohoAuthHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.message || d.summary || `Zoho Calendar event creation failed (${res.status})`);
    // Zoho's create-event response shape for the new event's id isn't consistently
    // documented (some Zoho APIs echo back an events[] array, others a bare object) —
    // check the likely shapes defensively rather than assuming one.
    const created = Array.isArray(d.events) ? d.events[0] : d;
    const eventId = created?.uid || created?.eventid || "";
    return { joinUrl: "", htmlLink: "", eventId };
  }

  // Google: creates a real Calendar event with a Google Meet room attached
  // (conferenceDataVersion=1 asks the API to provision one) and returns its
  // stable join URL — the same URL for every attendee, unlike meet.google.com/new.
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
