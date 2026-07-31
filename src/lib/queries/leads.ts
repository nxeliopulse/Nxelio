"use server";
import { createClient } from "@/lib/supabase/server";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { archiveImportedLeads, markArchivedLeadsDeleted } from "@/lib/queries/lead-import-archive";
import { revalidatePath } from "next/cache";
import { scoreLeadWithAi, isAiConfigured, type AiScoreResult } from "@/lib/ai/actions";
import { mapWithConcurrency } from "@/lib/utils";

export interface LeadRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  industry: string | null;
  interest_area: string | null;
  /** Standard CRM job title — distinct from interest_area (kept for backward compat). */
  job_title: string | null;
  /** "C-Level" | "VP" | "Director" | "Manager" | "Individual Contributor" — derived from job_title where possible. */
  seniority: string | null;
  department: string | null;
  /** Headcount bucket, e.g. "51-200" — manual/CSV entry only; no real source provides this today. */
  company_size: string | null;
  /** Manual/CSV entry only; no real source provides this today. */
  annual_revenue: string | null;
  /** "valid" | "catch_all" | "unknown" — only ever set from a real verification check, never guessed. */
  email_verification_status: string | null;
  twitter_handle: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  source: string | null;
  message: string | null;
  linkedin: string | null;
  website_url: string | null;
  lead_score: number;
  /** Full saved AI score breakdown (null until the lead is scored). */
  ai_score: AiScoreResult | null;
  status: string;
  verified: boolean;
  is_favorite: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  /** Computed values from custom AI columns, keyed by ai_column_definitions.id. */
  custom_fields: Record<string, { value: string; updated_at: string }> | null;
  /** Permanent links to whatever this lead became on conversion — set once, never cleared. */
  converted_account_id: string | null;
  converted_contact_id: string | null;
  converted_opportunity_id: string | null;
}

/** Splits "Jane Doe" into { first: "Jane", last: "Doe" } — same convention used
 *  across the app (e.g. email-guess.ts) for deriving first/last from a full name. */
function splitFullName(fullName: string | null | undefined): { first: string | null; last: string | null } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") || null };
}

export async function getLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getLeads error:", error);
    return [];
  }
  return data ?? [];
}

export async function getLeadById(id: string): Promise<LeadRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*").eq("id", id).single();
  return data;
}

export async function getLeadStats() {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("status, lead_score");
  if (!data) return { total: 0, hot: 0, scored: 0, converted: 0 };
  return {
    total: data.length,
    hot: data.filter((l) => l.status === "Hot").length,
    scored: data.filter((l) => l.lead_score > 0).length,
    converted: data.filter((l) => l.status === "Converted").length,
  };
}

export async function createLead(payload: Partial<LeadRow>) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").insert(payload).select().single();
  if (error) throw error;
  revalidatePath("/leads");
  await logAudit({ action: "lead.created", entityType: "lead", entityId: data.id, entityLabel: data.full_name || data.company_name || data.email });
  return data;
}

export async function updateLead(id: string, payload: Partial<LeadRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  await logAudit({ action: "lead.updated", entityType: "lead", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteLead(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/leads");
  await logAudit({ action: "lead.deleted", entityType: "lead", entityId: id });
  await markArchivedLeadsDeleted([id]);
}

export async function bulkDeleteLeads(ids: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) throw error;
  revalidatePath("/leads");
  await logAudit({ action: "lead.bulk_deleted", entityType: "lead", metadata: { count: ids.length, ids } });
  await markArchivedLeadsDeleted(ids);
}

export async function bulkInsertLeads(
  leads: Array<Partial<LeadRow>>,
  opts?: { defaultSource?: string }
): Promise<{ inserted: number; duplicates: number; error?: string }> {
  if (!leads.length) return { inserted: 0, duplicates: 0 };
  const supabase = await createClient();

  // Build a set of existing identifiers (email + linkedin) to skip duplicates.
  const { data: existingRows } = await supabase
    .from("leads")
    .select("email, linkedin");
  const norm = (s: string | null | undefined) => (s || "").toLowerCase().trim();
  const existing = new Set<string>();
  for (const r of existingRows || []) {
    if (r.email) existing.add("e:" + norm(r.email));
    if (r.linkedin) existing.add("l:" + norm(r.linkedin));
  }

  const seen = new Set<string>();
  let duplicates = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const l of leads) {
    // A lead must have at least one contact (email / website / linkedin) or the DB
    // rejects the whole batch. Drop contactless rows instead of failing the import.
    if (!l.email && !l.website_url && !l.linkedin) continue;
    const eKey = l.email ? "e:" + norm(l.email) : null;
    const lKey = l.linkedin ? "l:" + norm(l.linkedin) : null;
    const isDup =
      (eKey && (existing.has(eKey) || seen.has(eKey))) ||
      (lKey && (existing.has(lKey) || seen.has(lKey)));
    if (isDup) {
      duplicates++;
      continue;
    }
    if (eKey) seen.add(eKey);
    if (lKey) seen.add(lKey);
    // first_name/last_name are real columns now — derive them when the caller
    // didn't already split them out explicitly (e.g. ManualEntryForm does).
    const derived = splitFullName(l.full_name);
    rows.push({
      full_name: l.full_name ?? null,
      first_name: l.first_name ?? derived.first,
      last_name: l.last_name ?? derived.last,
      email: l.email ?? null,
      phone: l.phone ?? null,
      company_name: l.company_name ?? null,
      industry: l.industry ?? null,
      interest_area: l.interest_area ?? null,
      job_title: l.job_title ?? null,
      seniority: l.seniority ?? null,
      department: l.department ?? null,
      company_size: l.company_size ?? null,
      annual_revenue: l.annual_revenue ?? null,
      email_verification_status: l.email_verification_status ?? null,
      twitter_handle: l.twitter_handle ?? null,
      street_address: l.street_address ?? null,
      city: l.city ?? null,
      state: l.state ?? null,
      country: l.country ?? null,
      postal_code: l.postal_code ?? null,
      linkedin: l.linkedin ?? null,
      website_url: l.website_url ?? null,
      message: l.message ?? null,
      source: l.source ?? opts?.defaultSource ?? "Import",
      status: l.status ?? "New",
    });
  }

  if (!rows.length) return { inserted: 0, duplicates };

  const { data, error } = await supabase.from("leads").insert(rows).select();
  if (error) {
    console.error("bulkInsertLeads error:", error);
    return { inserted: 0, duplicates, error: error.message };
  }
  revalidatePath("/leads");
  const inserted = data?.length ?? 0;
  if (inserted > 0) {
    await notifyCurrentUser({
      type: "leads",
      title: `${inserted} lead${inserted === 1 ? "" : "s"} imported`,
      message: opts?.defaultSource ? `Via ${opts.defaultSource}` : "Via import",
      link: "/leads",
    });
    const sourceLabel = opts?.defaultSource ?? "Import";
    await logAudit({
      action: sourceLabel === "Buy Leads" ? "leads.bought" : "leads.imported",
      entityType: "lead",
      metadata: { count: inserted, duplicates, source: sourceLabel },
    });
    await archiveImportedLeads((data as LeadRow[]) ?? [], sourceLabel);

    // Score every newly imported lead automatically, so Lead Score is populated
    // right away instead of requiring the user to open each lead's Score tab.
    // Best-effort per lead — one failure (e.g. AI credits run out mid-batch)
    // just leaves that lead unscored rather than blocking the rest of the import.
    if (await isAiConfigured()) {
      const ids = ((data as LeadRow[]) ?? []).map((l) => l.id).filter(Boolean);
      await mapWithConcurrency(ids, 4, async (id) => {
        try { await scoreLeadWithAi(id); } catch { /* left unscored */ }
      });
    }
  }
  return { inserted, duplicates };
}
