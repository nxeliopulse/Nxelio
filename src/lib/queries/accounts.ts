"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import type { ContactRow } from "@/lib/queries/contacts";

export interface AccountRow {
  id: string;
  account_name: string;
  account_owner: string | null;
  parent_account_id: string | null;
  phone: string | null;
  website: string | null;
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
  created_at: string;
  updated_at: string;
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").insert(payload).select().single();
  if (error) throw error;
  revalidatePath("/accounts");
  await logAudit({ action: "account.created", entityType: "account", entityId: data.id, entityLabel: data.account_name });
  return data;
}

export async function updateAccount(id: string, payload: Partial<AccountRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  await logAudit({ action: "account.updated", entityType: "account", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
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
