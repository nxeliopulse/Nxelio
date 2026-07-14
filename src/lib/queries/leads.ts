"use server";
import { createClient } from "@/lib/supabase/server";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { archiveImportedLeads, markArchivedLeadsDeleted } from "@/lib/queries/lead-import-archive";
import { revalidatePath } from "next/cache";
import type { AiScoreResult } from "@/lib/ai/actions";

export interface LeadRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  industry: string | null;
  interest_area: string | null;
  source: string | null;
  message: string | null;
  linkedin: string | null;
  website_url: string | null;
  lead_score: number;
  /** Full saved AI score breakdown (null until the lead is scored). */
  ai_score: AiScoreResult | null;
  status: string;
  verified: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
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
    rows.push({
      full_name: l.full_name ?? null,
      email: l.email ?? null,
      phone: l.phone ?? null,
      company_name: l.company_name ?? null,
      industry: l.industry ?? null,
      interest_area: l.interest_area ?? null,
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
  }
  return { inserted, duplicates };
}
