"use server";
import { createClient } from "@/lib/supabase/server";

export interface GlobalSearchLead {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
}

export interface GlobalSearchCampaign {
  id: string;
  campaign_name: string;
  status: string;
}

export interface GlobalSearchResult {
  leads: GlobalSearchLead[];
  campaigns: GlobalSearchCampaign[];
}

const RESULT_LIMIT = 5;

/** Topbar search-as-you-type — searches both leads and campaigns. */
export async function globalSearch(query: string): Promise<GlobalSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { leads: [], campaigns: [] };
  const supabase = await createClient();
  // Strip characters that are structurally significant to PostgREST's .or() filter
  // syntax (comma separates conditions, parens group them) so odd input like
  // "Acme, Inc" can't break the query — the search just ignores those characters.
  const safe = q.replace(/[,()]/g, "");
  if (!safe) return { leads: [], campaigns: [] };
  const like = `%${safe}%`;

  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, full_name, company_name, email")
      .or(`full_name.ilike.${like},company_name.ilike.${like},email.ilike.${like}`)
      .limit(RESULT_LIMIT),
    supabase
      .from("campaigns")
      .select("id, campaign_name, status")
      .ilike("campaign_name", like)
      .limit(RESULT_LIMIT),
  ]);

  return { leads: leads ?? [], campaigns: campaigns ?? [] };
}
