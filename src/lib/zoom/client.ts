import "server-only";
import { zoomConfig, zoomRedirectUri } from "./config";

export interface ZoomTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
  scope?: string;
}

// user:read:user resolves the connected account's email (GET /v2/users/me);
// meeting:write:meeting is what lets us create real meetings via POST /v2/users/me/meetings.
const ZOOM_SCOPE = "user:read:user meeting:write:meeting";
const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${zoomConfig.clientId}:${zoomConfig.clientSecret}`).toString("base64");
}

export function buildZoomAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: zoomConfig.clientId,
    response_type: "code",
    redirect_uri: zoomRedirectUri(),
    scope: ZOOM_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

async function postToken(params: Record<string, string>) {
  const res = await fetch(`${TOKEN_URL}?${new URLSearchParams(params)}`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.reason || data.error_description || data.error || `Zoom token request failed (${res.status})`);
  }
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

function toTokenSet(d: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }): ZoomTokenSet {
  const expiresAt = new Date(Date.now() + Math.max(0, (d.expires_in || 3600) - 60) * 1000).toISOString();
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt, scope: d.scope };
}

export async function exchangeZoomCode(code: string): Promise<ZoomTokenSet> {
  const d = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: zoomRedirectUri(),
  });
  return toTokenSet(d);
}

export async function refreshZoomToken(refreshToken: string): Promise<ZoomTokenSet> {
  const d = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return toTokenSet(d);
}

export async function fetchZoomEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await res.json().catch(() => ({}));
  return d.email || null;
}

export interface CreateZoomMeetingInput {
  title: string;
  startIso: string;
  endIso: string;
}

export interface CreateZoomMeetingResult {
  joinUrl: string;
  meetingId: string;
}

/** Creates a real Zoom meeting (POST /v2/users/me/meetings) and returns its stable join_url. */
export async function createZoomMeeting(accessToken: string, input: CreateZoomMeetingInput): Promise<CreateZoomMeetingResult> {
  const durationMin = Math.max(1, Math.round((new Date(input.endIso).getTime() - new Date(input.startIso).getTime()) / 60000));
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.title,
      type: 2, // scheduled meeting
      start_time: input.startIso,
      duration: durationMin,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || `Zoom meeting creation failed (${res.status})`);
  if (!d.join_url) throw new Error("Zoom didn't return a join link for this meeting");
  return { joinUrl: d.join_url, meetingId: String(d.id) };
}
