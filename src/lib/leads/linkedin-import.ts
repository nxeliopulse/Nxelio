"use server";
import { createClient } from "@/lib/supabase/server";
import { bulkInsertLeads } from "@/lib/queries/leads";
import { unipileConfigured, unipileLinkedInSearch, unipilePostEngagers, postUrlToSocialId, type UnipileProfile } from "@/lib/outreach/unipile";

export interface LinkedInImportResult {
  ok: boolean;
  needsConnect?: boolean;
  found: number;
  inserted: number;
  duplicates: number;
  error?: string;
}

/** All of this workspace's connected LinkedIn account ids, newest first. */
async function connectedLinkedInAccountIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_accounts")
    .select("account_id")
    .eq("channel", "linkedin")
    .order("updated_at", { ascending: false });
  return (data || []).map((d) => d.account_id as string).filter(Boolean);
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
  const accountIds = await connectedLinkedInAccountIds();
  if (accountIds.length === 0) {
    return { ok: false, needsConnect: true, found: 0, inserted: 0, duplicates: 0, error: "Connect your LinkedIn account first." };
  }
  const url = opts.url.trim();
  if (!url) {
    return { ok: false, found: 0, inserted: 0, duplicates: 0, error: "Paste a LinkedIn URL." };
  }
  // For posts, make sure we can read a post id out of the URL before calling Unipile.
  if (opts.source === "linkedin-post" && !postUrlToSocialId(url)) {
    return { ok: false, found: 0, inserted: 0, duplicates: 0, error: "Couldn't read that post URL. Open the post on LinkedIn, use “Copy link to post”, and paste the full link (it should contain “activity-…”)." };
  }

  // Try each connected account in turn — a dead/expired one ("account not found")
  // is skipped so a stale connection never breaks the import.
  const limit = opts.limit ?? 50;
  let lastError = "";
  for (const accountId of accountIds) {
    try {
      const { profiles } =
        opts.source === "linkedin-post"
          ? await unipilePostEngagers({ accountId, postUrl: url, limit })
          : await unipileLinkedInSearch({ accountId, url, limit });

      // Every lead needs a LinkedIn URL (these have no email) — drop private
      // "LinkedIn Member" results with no public profile so they can't break the insert.
      const usable = profiles.filter((p) => p.profileUrl);
      if (usable.length === 0) {
        // A working account that simply returned nothing usable — don't keep trying others.
        return { ok: true, found: 0, inserted: 0, duplicates: 0, error: "No public profiles to import (results were private or had no profile link). Try a different search/post." };
      }

      const label = opts.source === "linkedin-post" ? "LinkedIn Post" : "LinkedIn Search";
      const res = await bulkInsertLeads(usable.map((p) => toLead(p, label)), { defaultSource: label });
      return { ok: !res.error, found: usable.length, inserted: res.inserted, duplicates: res.duplicates, error: res.error };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "LinkedIn import failed";
      // "account not found" / auth errors → try the next connected account.
      if (/not found|unauthor|credential|disconnect|session/i.test(lastError)) continue;
      return { ok: false, found: 0, inserted: 0, duplicates: 0, error: lastError };
    }
  }
  return { ok: false, found: 0, inserted: 0, duplicates: 0, error: lastError || "All connected LinkedIn accounts failed. Reconnect one in Connections." };
}
