"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface SalesQuotaRow {
  id: string;
  userId: string | null;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  quotaType: "revenue" | "pipeline";
}

interface QuotaDbRow {
  id: string;
  user_id: string | null;
  period_start: string;
  period_end: string;
  target_amount: number;
  quota_type: "revenue" | "pipeline";
}

function toRow(r: QuotaDbRow): SalesQuotaRow {
  return { id: r.id, userId: r.user_id, periodStart: r.period_start, periodEnd: r.period_end, targetAmount: Number(r.target_amount), quotaType: r.quota_type };
}

export async function listSalesQuotas(): Promise<SalesQuotaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("sales_quotas").select("id, user_id, period_start, period_end, target_amount, quota_type").order("period_start", { ascending: false });
  return ((data as QuotaDbRow[]) || []).map(toRow);
}

/** The single quota row (workspace-wide or a specific rep's) covering `date` — used by
 *  Revenue Analytics (Pipeline Coverage/Quota Attainment/Gap to Target) and the Team
 *  leaderboard (per-rep Target/Attainment%). Returns null if no quota is configured. */
export async function getActiveQuota(date: Date, userId?: string | null): Promise<SalesQuotaRow | null> {
  const supabase = await createClient();
  const iso = date.toISOString().slice(0, 10);
  let query = supabase
    .from("sales_quotas")
    .select("id, user_id, period_start, period_end, target_amount, quota_type")
    .lte("period_start", iso)
    .gte("period_end", iso);
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  const { data } = await query.limit(1).maybeSingle();
  return data ? toRow(data as QuotaDbRow) : null;
}

/** All active per-rep quotas covering `date`, keyed by user id — one query for the
 *  whole Team leaderboard instead of one per rep. */
export async function getActiveQuotasByUser(date: Date): Promise<Map<string, SalesQuotaRow>> {
  const supabase = await createClient();
  const iso = date.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("sales_quotas")
    .select("id, user_id, period_start, period_end, target_amount, quota_type")
    .lte("period_start", iso)
    .gte("period_end", iso)
    .not("user_id", "is", null);
  const map = new Map<string, SalesQuotaRow>();
  for (const r of (data as QuotaDbRow[]) || []) {
    if (r.user_id) map.set(r.user_id, toRow(r));
  }
  return map;
}

export interface QuotaInput {
  userId: string | null;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  quotaType: "revenue" | "pipeline";
}

/** Admin-only in practice — RLS's sales_quotas_admin_write policy is the real
 *  enforcement; a non-admin's insert is simply rejected by Postgres. */
export async function createSalesQuota(input: QuotaInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_quotas").insert({
    user_id: input.userId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    target_amount: input.targetAmount,
    quota_type: input.quotaType,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/administration");
  revalidatePath("/analytics/revenue");
  revalidatePath("/analytics/team");
  return { ok: true };
}

export async function deleteSalesQuota(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_quotas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/administration");
  revalidatePath("/analytics/revenue");
  revalidatePath("/analytics/team");
  return { ok: true };
}
