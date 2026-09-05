import "server-only";
import { hubspotConfig, hubspotRedirectUri } from "./config";

/**
 * HubSpot OAuth client + Contacts API calls. Each workspace connects its own
 * HubSpot account (see hubspot_accounts table / hubspot-accounts.ts) — every
 * call here takes the caller's access token rather than a single shared key.
 */

const CONTACTS_SCOPE = "crm.objects.contacts.read crm.objects.contacts.write";
const AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

export interface HubspotTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
  scope?: string;
}

export function buildHubspotAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: hubspotConfig.clientId,
    redirect_uri: hubspotRedirectUri(),
    scope: CONTACTS_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

async function postToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: hubspotConfig.clientId,
      client_secret: hubspotConfig.clientSecret,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error_description || data.error || `HubSpot token request failed (${res.status})`);
  }
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

function toTokenSet(d: { access_token: string; refresh_token?: string; expires_in: number }): HubspotTokenSet {
  const expiresAt = new Date(Date.now() + Math.max(0, (d.expires_in || 1800) - 60) * 1000).toISOString();
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt, scope: CONTACTS_SCOPE };
}

export async function exchangeHubspotCode(code: string): Promise<HubspotTokenSet> {
  const d = await postToken({
    grant_type: "authorization_code",
    redirect_uri: hubspotRedirectUri(),
    code,
  });
  return toTokenSet(d);
}

export async function refreshHubspotToken(refreshToken: string): Promise<HubspotTokenSet> {
  const d = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return toTokenSet(d);
}

export interface HubspotPortalInfo {
  portalId: string | null;
  hubDomain: string | null;
}

/** Resolves which HubSpot portal (account) this token belongs to, for display in Settings. */
export async function fetchHubspotPortalInfo(accessToken: string): Promise<HubspotPortalInfo> {
  const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { portalId: null, hubDomain: null };
  return { portalId: d.hub_id ? String(d.hub_id) : null, hubDomain: d.hub_domain || null };
}

export interface HubspotContactInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
}

export interface HubspotSyncResult {
  ok: boolean;
  contactId?: string;
  error?: string;
}

function toProperties(input: HubspotContactInput): Record<string, string> {
  const props: Record<string, string> = { email: input.email };
  if (input.firstName) props.firstname = input.firstName;
  if (input.lastName) props.lastname = input.lastName;
  if (input.company) props.company = input.company;
  if (input.jobTitle) props.jobtitle = input.jobTitle;
  if (input.phone) props.phone = input.phone;
  if (input.website) props.website = input.website;
  if (input.city) props.city = input.city;
  if (input.state) props.state = input.state;
  if (input.country) props.country = input.country;
  if (input.postalCode) props.zip = input.postalCode;
  return props;
}

async function hubspotFetch(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function findContactIdByEmail(accessToken: string, email: string): Promise<string | null> {
  const res = await hubspotFetch(accessToken, "/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      limit: 1,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.results?.[0]?.id ?? null;
}

/** Creates the contact if it doesn't exist by email, otherwise updates it. Never throws. */
export async function upsertContact(accessToken: string, input: HubspotContactInput): Promise<HubspotSyncResult> {
  if (!input.email) return { ok: false, error: "This lead has no email address — HubSpot contacts require one." };

  try {
    const properties = toProperties(input);
    const existingId = await findContactIdByEmail(accessToken, input.email);

    const res = existingId
      ? await hubspotFetch(accessToken, `/crm/v3/objects/contacts/${existingId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        })
      : await hubspotFetch(accessToken, "/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = `HubSpot error (${res.status})`;
      try {
        const parsed = JSON.parse(body);
        if (parsed?.message) message = parsed.message;
      } catch {
        // leave default message
      }
      console.error("[hubspot] upsertContact failed:", res.status, body.slice(0, 500));
      return { ok: false, error: message };
    }

    const data = await res.json();
    return { ok: true, contactId: existingId || data.id };
  } catch (err) {
    console.error("[hubspot] upsertContact threw:", err);
    return { ok: false, error: "Couldn't reach HubSpot. Try again in a moment." };
  }
}
