"use server";
import { createClient } from "@/lib/supabase/server";
import { bulkInsertLeads } from "@/lib/queries/leads";
import { unipileConfigured, unipileLinkedInSearch, unipilePostEngagers, type UnipileProfile } from "@/lib/outreach/unipile";

export interface LinkedInImportResult {
  ok: boolean;
  needsConnect?: boolean;
  found: number;
  inserted: number;
  duplicates: number;
  error?: string;
}

/** Find this workspace's connected LinkedIn account id (via Unipile). */
async function connectedLinkedInAccountId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_accounts")
    .select("account_id, status")
    .eq("channel", "linkedin")
    .limit(1)
    .maybeSingle();
  return data?.account_id ?? null;
}

export async function hasLinkedInAccount(): Promise<boolean> {
  if (!unipileConfigured) return false;
  return (await connectedLinkedInAccountId()) !== null;
}

function toLead(p: UnipileProfile, source: string) {
  return {
    full_name: p.name,
    company_name: null,
    message: p.headline,         // store role/headline as a note
    linkedin: p.profileUrl,
    industry: null,
    interest_area: p.location,
    source,
    status: "New",
  };
}

/**
 * Pull real profiles from LinkedIn via the connected account and import them.
 * `source` selects the retrieval mode; `url` is the LinkedIn search or post URL.
 */
export async function importLinkedInLeads(opts: {
  source: "linkedin-search" | "linkedin-post";
  url: string;
  limit?: number;
}): Promise<LinkedInImportResult> {
  if (!unipileConfigured) {
    return { ok: false, found: 0, inserted: 0, duplicates: 0, error: "LinkedIn (Unipile) isn't configured on this environment." };
  }
  const accountId = await connectedLinkedInAccountId();
  if (!accountId) {
    return { ok: false, needsConnect: true, found: 0, inserted: 0, duplicates: 0, error: "Connect your LinkedIn account first." };
  }
  if (!opts.url.trim()) {
    return { ok: false, found: 0, inserted: 0, duplicates: 0, error: "Paste a LinkedIn URL." };
  }

  try {
    const { profiles } =
      opts.source === "linkedin-post"
        ? await unipilePostEngagers({ accountId, postUrl: opts.url.trim(), limit: opts.limit ?? 50 })
        : await unipileLinkedInSearch({ accountId, url: opts.url.trim(), limit: opts.limit ?? 50 });

    const usable = profiles.filter((p) => p.profileUrl || p.name);
    if (usable.length === 0) {
      return { ok: true, found: 0, inserted: 0, duplicates: 0, error: "No profiles returned. Check the URL is a valid LinkedIn search/post and your account has access." };
    }

    const label = opts.source === "linkedin-post" ? "LinkedIn Post" : "LinkedIn Search";
    const res = await bulkInsertLeads(usable.map((p) => toLead(p, label)), { defaultSource: label });
    return { ok: !res.error, found: usable.length, inserted: res.inserted, duplicates: res.duplicates, error: res.error };
  } catch (err) {
    return { ok: false, found: 0, inserted: 0, duplicates: 0, error: err instanceof Error ? err.message : "LinkedIn import failed" };
  }
}
