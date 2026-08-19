"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";
import type { ContactRow } from "@/lib/queries/contacts";
import { isValidPhoneNumber } from "libphonenumber-js";

/**
 * The client always sends phone/fax pre-formatted to international form
 * (e.g. "+1 555 123 4567") via formatPhoneForStorage() — that's
 * self-describing, so no country needs to be passed here. Never trust the
 * client alone though: reject anything that doesn't actually parse.
 */
function assertValidPhoneFields(payload: Partial<AccountRow>) {
  for (const field of ["phone", "fax"] as const) {
    const value = payload[field];
    if (value && !isValidPhoneNumber(value)) {
      throw new Error(`${field === "phone" ? "Phone" : "Fax"} number isn't valid.`);
    }
  }
}

export interface AccountRow {
  id: string;
  account_name: string;
  account_owner: string | null;
  parent_account_id: string | null;
  account_site: string | null;
  parent_account: string | null;
  account_number: string | null;
  phone: string | null;
  fax: string | null;
  website: string | null;
  domain: string | null;
  account_status: string | null;
  industry: string | null;
  account_type: string | null;
  annual_revenue: number | null;
  employees: number | null;
  ownership: string | null;
  rating: string | null;
  sic_code: string | null;
  ticker_symbol: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_country: string | null;
  billing_zip: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_country: string | null;
  shipping_zip: string | null;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Current user's display name, for stamping created_by/updated_by (mirrors logAudit's actor_name fallback). */
async function getCurrentUserName(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("users").select("full_name, email").eq("user_id", user.id).single();
  return profile?.full_name || profile?.email || null;
}

export async function getAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getAccounts error:", error.message, error.details, error.hint, error.code);
    return [];
  }
  return data ?? [];
}

export async function getAccountById(id: string): Promise<AccountRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("*").eq("id", id).single();
  return data;
}

export async function getAccountsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true });
  return count ?? 0;
}

export async function getAccountContacts(accountId: string): Promise<ContactRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getAccountContacts error:", error.message, error.details, error.hint, error.code);
    return [];
  }
  return data ?? [];
}

/** Strips protocol/www/trailing path so "https://www.acme.com/" and "acme.com" compare equal. */
function normalizeHost(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/**
 * Finds an existing Account that plausibly matches a lead being converted —
 * by website (normalized host) first, then by exact account name. Used to
 * offer "Use existing Account" in the Convert Lead modal instead of creating
 * a duplicate.
 */
export async function findMatchingAccount({ companyName, website }: { companyName?: string | null; website?: string | null }): Promise<AccountRow | null> {
  const supabase = await createClient();

  if (website?.trim()) {
    const host = normalizeHost(website);
    if (host) {
      const { data } = await supabase.from("accounts").select("*").ilike("website", `%${host}%`).limit(1).maybeSingle();
      if (data) return data;
    }
  }

  if (companyName?.trim()) {
    const { data } = await supabase.from("accounts").select("*").ilike("account_name", companyName.trim()).limit(1).maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function createAccount(payload: Partial<AccountRow>) {
  assertValidPhoneFields(payload);
  const supabase = await createClient();
  const actorName = await getCurrentUserName(supabase);
  const { data, error } = await supabase.from("accounts").insert({ ...payload, created_by: actorName, updated_by: actorName }).select().single();
  if (error) throw error;
  revalidatePath("/accounts");
  await logAudit({ action: "account.created", entityType: "account", entityId: data.id, entityLabel: data.account_name });
  return data;
}

export async function updateAccount(id: string, payload: Partial<AccountRow>) {
  assertValidPhoneFields(payload);
  const supabase = await createClient();
  const actorName = await getCurrentUserName(supabase);
  // .select("id") to get the updated row back — PostgREST reports no error when
  // RLS silently blocks an update (0 rows affected looks identical to success
  // otherwise), same footgun already handled below in deleteAccount.
  const { data, error } = await supabase.from("accounts").update({ ...payload, updated_by: actorName }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Account not found, or you don't have permission to edit it.");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  await logAudit({ action: "account.updated", entityType: "account", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteAccount(id: string) {
  const supabase = await createClient();
  // .select() to get the deleted row(s) back — PostgREST reports no error when
  // RLS silently blocks a delete (0 rows affected looks identical to success
  // otherwise), so this is the only way to detect that and report it honestly.
  const { data, error } = await supabase.from("accounts").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Account not found, or you don't have permission to delete it.");
  revalidatePath("/accounts");
  await logAudit({ action: "account.deleted", entityType: "account", entityId: id });
}

export async function bulkDeleteAccounts(ids: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().in("id", ids);
  if (error) throw error;
  revalidatePath("/accounts");
  await logAudit({ action: "account.bulk_deleted", entityType: "account", metadata: { count: ids.length, ids } });
}

/**
 * Bulk-imports accounts (e.g. from a CSV upload) — mirrors bulkInsertLeads'
 * shape/behavior: build a set of identifiers already in the DB, skip
 * duplicates from the incoming batch (counting them), insert the rest in one
 * batch, then revalidate + notify + audit-log.
 *
 * Dedup key: normalized website host (reusing normalizeHost) OR an exact
 * (case-insensitive) account name match — whichever matches first wins.
 */
export async function bulkInsertAccounts(
  accounts: Array<Partial<AccountRow>>
): Promise<{ inserted: number; duplicates: number; error?: string }> {
  if (!accounts.length) return { inserted: 0, duplicates: 0 };
  const supabase = await createClient();
  const actorName = await getCurrentUserName(supabase);

  // Build dedup sets from what's already in the DB.
  const { data: existingRows } = await supabase.from("accounts").select("account_name, website");
  const existingHosts = new Set<string>();
  const existingNames = new Set<string>();
  for (const r of existingRows || []) {
    if (r.website) {
      const host = normalizeHost(r.website);
      if (host) existingHosts.add(host);
    }
    if (r.account_name) existingNames.add(r.account_name.toLowerCase().trim());
  }

  const seenHosts = new Set<string>();
  const seenNames = new Set<string>();
  let duplicates = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const a of accounts) {
    // account_name is required — drop rows without one instead of failing the whole batch.
    const name = (a.account_name || "").trim();
    if (!name) continue;
    const nameKey = name.toLowerCase();
    const host = a.website ? normalizeHost(a.website) : "";
    const isDup =
      existingNames.has(nameKey) || seenNames.has(nameKey) ||
      (!!host && (existingHosts.has(host) || seenHosts.has(host)));
    if (isDup) {
      duplicates++;
      continue;
    }
    seenNames.add(nameKey);
    if (host) seenHosts.add(host);
    rows.push({
      account_name: name,
      website: a.website ?? null,
      domain: a.domain ?? null,
      phone: a.phone ?? null,
      industry: a.industry ?? null,
      account_type: a.account_type ?? null,
      employees: a.employees ?? null,
      annual_revenue: a.annual_revenue ?? null,
      rating: a.rating ?? null,
      ownership: a.ownership ?? null,
      account_status: a.account_status ?? null,
      created_by: actorName,
      updated_by: actorName,
    });
  }

  if (!rows.length) return { inserted: 0, duplicates };

  const { data, error } = await supabase.from("accounts").insert(rows).select();
  if (error) {
    console.error("bulkInsertAccounts error:", error);
    return { inserted: 0, duplicates, error: error.message };
  }
  revalidatePath("/accounts");
  const inserted = data?.length ?? 0;
  if (inserted > 0) {
    await notifyCurrentUser({
      type: "accounts",
      title: `${inserted} account${inserted === 1 ? "" : "s"} imported`,
      message: "Via CSV upload",
      link: "/accounts",
    });
    await logAudit({
      action: "accounts.imported",
      entityType: "account",
      metadata: { count: inserted, duplicates, source: "CSV Upload" },
    });
  }
  return { inserted, duplicates };
}
