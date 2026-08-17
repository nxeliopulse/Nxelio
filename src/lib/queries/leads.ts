"use server";
import { createClient } from "@/lib/supabase/server";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { archiveImportedLeads, markArchivedLeadsDeleted } from "@/lib/queries/lead-import-archive";
import { revalidatePath } from "next/cache";
import { scoreLeadWithAi, isAiConfigured, type AiScoreResult } from "@/lib/ai/actions";
import { mapWithConcurrency } from "@/lib/utils";
import { isSuperAdmin } from "@/lib/queries/auth-guards";
import { isManualStatusTransitionAllowed, statusTransitionError } from "@/lib/leads/status-flow";
import { isValidPhoneNumber } from "libphonenumber-js";

/**
 * The client always sends phone pre-formatted to international form (e.g.
 * "+1 555 123 4567") via formatPhoneForStorage() — that's self-describing, so
 * no country needs to be passed here. Never trust the client alone though:
 * reject anything that doesn't actually parse (mirrors accounts.ts's check).
 */
function assertValidLeadPhone(payload: Partial<LeadRow>) {
  if (payload.phone && !isValidPhoneNumber(payload.phone)) {
    throw new Error("Phone number isn't valid.");
  }
}

/** Non-throwing lookup so callers (the edit form) can check up front and show
 *  a friendly popup, instead of relying on updateLead's throw — a thrown
 *  Server Action error surfaces as a full route-level error screen here,
 *  not an inline message, so the UI should never let it get that far. */
export async function findLeadByPhone(
  phone: string | null | undefined,
  excludeId?: string
): Promise<{ id: string; full_name: string | null } | null> {
  if (!phone) return null;
  const supabase = await createClient();
  let query = supabase.from("leads").select("id, full_name").eq("phone", phone).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

/** A phone number identifies one real person — reject saving it onto a second
 *  lead. `excludeId` lets updateLead re-save a lead's own unchanged number.
 *  Kept as a last-resort safety net (e.g. for the AI tool path) — the edit
 *  form itself should never reach this, since it pre-checks via
 *  findLeadByPhone() and shows a popup before ever calling updateLead. */
async function assertPhoneNotTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  phone: string | null | undefined,
  excludeId?: string
) {
  if (!phone) return;
  let query = supabase.from("leads").select("id, full_name").eq("phone", phone).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  if (data) {
    throw new Error(
      `This phone number is already used by another lead${data.full_name ? ` (${data.full_name})` : ""}.`
    );
  }
}

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
  /** Set by Company-wise Buy Leads when the company was matched/created up
   *  front — NOT the same as converted_account_id (that means "was actually
   *  converted"); this just records "was sourced from this company" so
   *  Convert can pre-fill the right Account without re-matching by name. */
  discovered_account_id: string | null;
  /** Suppression flags (Phase 1 segmentation) — checked via isSuppressed() before every send. */
  email_opt_out: boolean | null;
  do_not_contact: boolean | null;
  email_bounced: boolean | null;
  /** Which of email/phone/linkedin/industry have already been edited once and are now Super-Admin-only. */
  locked_fields: Record<string, boolean> | null;
  tags: string[] | null;
  projects: string[] | null;
  priority: "High" | "Medium" | "Low" | null;
}

/**
 * Fields that lock themselves the first time they're edited — only a Super
 * Admin can change them after that. Not exported: a "use server" file may
 * only export async functions, and nothing outside this file needs the list
 * itself (the UI checks `lead.locked_fields` directly by field name).
 */
const SELF_LOCKING_FIELDS = ["email", "phone", "linkedin", "industry"] as const;

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
    hot: data.filter((l) => l.lead_score >= 70).length,
    scored: data.filter((l) => l.lead_score > 0).length,
    converted: data.filter((l) => l.status === "Converted").length,
  };
}

/**
 * Distinct, non-empty values already present on real leads for one column —
 * powers the Segment Builder's value dropdown for fields with no managed
 * picklist (e.g. Source, Country), so it still offers real choices instead
 * of free text, without needing an admin to curate a list first.
 */
export async function getDistinctLeadValues(
  column: "source" | "country" | "industry" | "interest_area" | "status" | "company_size" | "seniority"
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select(column).not(column, "is", null);
  if (error || !data) return [];
  const values = new Set<string>();
  for (const row of data as Record<string, string | null>[]) {
    const v = row[column]?.trim();
    if (v) values.add(v);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export async function createLead(payload: Partial<LeadRow>) {
  assertValidLeadPhone(payload);
  const supabase = await createClient();
  await assertPhoneNotTaken(supabase, payload.phone);
  const { data, error } = await supabase.from("leads").insert(payload).select().single();
  if (error) throw error;
  revalidatePath("/leads");
  await logAudit({ action: "lead.created", entityType: "lead", entityId: data.id, entityLabel: data.full_name || data.company_name || data.email });
  return data;
}

/**
 * `opts.allowConvertedStatus` exists ONLY for lead-conversion.ts's convertLead()
 * — the single legitimate place that's allowed to set status: "Converted".
 * Every other caller (the edit modal, the AI update_lead tool, etc.) goes
 * through the normal status-flow validation below, which always rejects
 * "Converted" as a manual target.
 */
export async function updateLead(id: string, payload: Partial<LeadRow>, opts?: { allowConvertedStatus?: boolean }) {
  assertValidLeadPhone(payload);
  const supabase = await createClient();
  if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
    await assertPhoneNotTaken(supabase, payload.phone, id);
  }

  if (payload.status !== undefined && !opts?.allowConvertedStatus) {
    const { data: current } = await supabase.from("leads").select("status").eq("id", id).single();
    const fromStatus = current?.status ?? "New";
    if (!isManualStatusTransitionAllowed(fromStatus, payload.status)) {
      throw new Error(statusTransitionError(fromStatus, payload.status));
    }
  }

  const touchedLockable = SELF_LOCKING_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(payload, f)
  );

  let finalPayload: Partial<LeadRow> = payload;

  if (touchedLockable.length) {
    const { data: current } = await supabase
      .from("leads")
      .select("email, phone, linkedin, industry, locked_fields")
      .eq("id", id)
      .single();
    const locked = (current?.locked_fields as Record<string, boolean> | null) ?? {};
    const admin = await isSuperAdmin();

    const blocked: string[] = [];
    const newlyLocked: string[] = [];

    for (const field of touchedLockable) {
      const currentVal = current?.[field] ?? null;
      const newVal = payload[field] ?? null;
      if (newVal === currentVal) continue; // no real change — nothing to lock or block

      if (locked[field] && !admin) {
        blocked.push(field);
      } else {
        newlyLocked.push(field);
      }
    }

    // Never silently drop a locked edit — the UI should already prevent this
    // (the field is disabled), so reaching here means it was bypassed; fail
    // loudly rather than save some fields and quietly skip others.
    if (blocked.length) {
      throw new Error(`${blocked.join(", ")} ${blocked.length === 1 ? "is" : "are"} locked and can only be changed by a Super Admin.`);
    }

    if (newlyLocked.length) {
      const updatedLocked = { ...locked };
      for (const f of newlyLocked) updatedLocked[f] = true;
      finalPayload = { ...payload, locked_fields: updatedLocked };
    }
  }

  const { error } = await supabase.from("leads").update(finalPayload).eq("id", id);
  if (error) throw error;
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  await logAudit({ action: "lead.updated", entityType: "lead", entityId: id, metadata: payload as Record<string, unknown> });

  // Once a lead is converted, its Account/Contact are the "real" record people
  // actually work from — but the Lead itself is never deleted (see
  // lead-conversion.ts), so edits made here would otherwise silently drift out
  // of sync with what was already converted. Mirror just the fields that
  // overlap 1:1 with the same person/company, best-effort (a sync failure here
  // should never roll back or block the lead's own save).
  await syncConvertedRecords(supabase, id, payload).catch(() => {});
}

const LEAD_TO_CONTACT_FIELD: Partial<Record<keyof LeadRow, string>> = {
  email: "email",
  phone: "phone",
  linkedin: "linkedin",
  job_title: "job_title",
  twitter_handle: "twitter",
  street_address: "mailing_street",
  city: "mailing_city",
  state: "mailing_state",
  country: "mailing_country",
  postal_code: "mailing_zip",
};

const LEAD_TO_ACCOUNT_FIELD: Partial<Record<keyof LeadRow, string>> = {
  website_url: "website",
  industry: "industry",
  street_address: "billing_street",
  city: "billing_city",
  state: "billing_state",
  country: "billing_country",
  postal_code: "billing_zip",
};

async function syncConvertedRecords(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string, payload: Partial<LeadRow>): Promise<void> {
  const { data: lead } = await supabase.from("leads").select("converted_contact_id, converted_account_id").eq("id", leadId).single();
  if (!lead?.converted_contact_id && !lead?.converted_account_id) return;

  if (lead.converted_contact_id) {
    const patch: Record<string, unknown> = {};
    for (const [leadField, contactField] of Object.entries(LEAD_TO_CONTACT_FIELD)) {
      if (leadField in payload) patch[contactField] = payload[leadField as keyof LeadRow];
    }
    if (Object.keys(patch).length) {
      await supabase.from("contacts").update(patch).eq("id", lead.converted_contact_id);
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${lead.converted_contact_id}`);
    }
  }

  if (lead.converted_account_id) {
    const patch: Record<string, unknown> = {};
    for (const [leadField, accountField] of Object.entries(LEAD_TO_ACCOUNT_FIELD)) {
      if (leadField in payload) patch[accountField] = payload[leadField as keyof LeadRow];
    }
    if (Object.keys(patch).length) {
      await supabase.from("accounts").update(patch).eq("id", lead.converted_account_id);
      revalidatePath("/accounts");
      revalidatePath(`/accounts/${lead.converted_account_id}`);
    }
  }
}

/**
 * Status changes are tracked separately from updateLead() because they
 * require a reason from the user — recorded both in the workspace-wide
 * audit log (lead.status_changed) and as a visible entry in the lead's own
 * Activities timeline (STATUS_CHANGED), so anyone opening the lead can see
 * why its status moved without digging into admin-only logs.
 */
export async function updateLeadStatus(id: string, newStatus: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: current } = await supabase.from("leads").select("status, full_name, company_name, email").eq("id", id).single();
  const fromStatus = current?.status ?? null;

  if (fromStatus !== null && !isManualStatusTransitionAllowed(fromStatus, newStatus)) {
    throw new Error(statusTransitionError(fromStatus, newStatus));
  }

  const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", id);
  if (error) throw error;

  const { data: actor } = user
    ? await supabase.from("users").select("full_name, email").eq("user_id", user.id).single()
    : { data: null };
  const changedByName = actor?.full_name || actor?.email || null;

  await supabase.from("lead_activities").insert({
    lead_id: id,
    activity_type: "STATUS_CHANGED",
    metadata: { from_status: fromStatus, to_status: newStatus, reason: reason.trim(), changed_by: changedByName },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  await logAudit({
    action: "lead.status_changed",
    entityType: "lead",
    entityId: id,
    entityLabel: current?.full_name || current?.company_name || current?.email || undefined,
    metadata: { from: fromStatus, to: newStatus, reason: reason.trim() },
  });
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
      discovered_account_id: l.discovered_account_id ?? null,
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
