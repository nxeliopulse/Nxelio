import "server-only";

const BASE_URL = (process.env.ANYSITE_BASE_URL || "https://api.anysite.io").replace(/\/+$/, "");
const API_KEY = process.env.ANYSITE_API_KEY;

export const anysiteConfigured = Boolean(API_KEY);

export interface AnysiteProspect {
  full_name: string;
  title: string;
  company_name: string;
  location: string;
  linkedin: string;
  email: string; // only set when AnySite returns a VERIFIED email
}

interface RawUser {
  name?: string;
  alias?: string;
  url?: string;
  headline?: string;
  location?: string;
}

// Trim a value to a DB column's max length so long LinkedIn headlines don't overflow.
const cut = (s: string | undefined, n: number) => (s || "").trim().slice(0, n);

/** Pull the company out of a LinkedIn headline like "Head of Marketing at Acme" / "VP Sales | Acme". */
function companyFromHeadline(headline: string): string {
  const at = headline.split(/\s+at\s+/i);
  if (at.length > 1) return at[1].split(/[|·•]/)[0].trim();
  const bar = headline.split(/\s*[|·•]\s*/);
  if (bar.length > 1) return bar[bar.length - 1].trim();
  return "";
}

async function anysitePost(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "access-token": API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AnySite (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Find a VERIFIED email for one LinkedIn profile. Returns "" if none / unverified / times out. */
async function findVerifiedEmail(url: string): Promise<string> {
  try {
    const data = await anysitePost("/api/linkedin/user/find_email_by_url", { url, timeout: 50 }, 55_000);
    const row = (Array.isArray(data) ? data[0] : data) as { email?: string; email_status?: string } | undefined;
    if (row && (row.email_status || "").toLowerCase() === "valid" && row.email) return cut(row.email, 255);
    return "";
  } catch {
    return "";
  }
}

/**
 * Real LinkedIn people search via AnySite. When `withEmail` is set, each prospect
 * is enriched with a VERIFIED email in parallel (best-effort — slow/unverified
 * ones are simply left without an email). All fields are trimmed to the lead
 * column limits so long headlines never break the import.
 */
export async function anysiteSearchPeople(criteria: {
  industry?: string;
  role?: string;
  location?: string;
  count: number;
  withEmail?: boolean;
}): Promise<{ ok: boolean; prospects: AnysiteProspect[]; error?: string }> {
  if (!API_KEY) return { ok: false, prospects: [], error: "AnySite not configured" };

  const count = Math.max(1, Math.min(25, Math.round(criteria.count || 10)));
  const keywords = [criteria.industry, criteria.role].filter(Boolean).join(" ").trim();

  const body: Record<string, unknown> = { count, timeout: 60 };
  if (keywords) body.keywords = keywords;
  if (criteria.role) body.title = criteria.role;
  if (criteria.industry) body.company_keywords = criteria.industry;

  let users: RawUser[];
  try {
    const data = (await anysitePost("/api/linkedin/search/users", body, 60_000)) as RawUser[] | { data?: RawUser[] };
    users = (Array.isArray(data) ? data : data.data || []).filter((u) => u.name).slice(0, count);
  } catch (e) {
    return { ok: false, prospects: [], error: e instanceof Error ? e.message : "AnySite request failed" };
  }
  if (!users.length) return { ok: false, prospects: [], error: "No matching people found. Try broader criteria." };

  const prospects: AnysiteProspect[] = users.map((u) => {
    const headline = (u.headline || "").trim();
    return {
      full_name: cut(u.name, 150),
      title: cut(headline, 150),
      company_name: cut(companyFromHeadline(headline), 200),
      location: cut(u.location, 150),
      linkedin: cut(u.url || (u.alias ? `https://www.linkedin.com/in/${u.alias}` : ""), 500),
      email: "",
    };
  });

  // Optional verified-email enrichment (parallel, best-effort).
  if (criteria.withEmail) {
    const emails = await Promise.all(prospects.map((p) => (p.linkedin ? findVerifiedEmail(p.linkedin) : Promise.resolve(""))));
    emails.forEach((e, i) => { prospects[i].email = e; });
  }

  return { ok: true, prospects };
}
