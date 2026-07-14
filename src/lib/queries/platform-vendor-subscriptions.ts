"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { revalidatePath } from "next/cache";

export interface VendorSubscriptionRow {
  id: string;
  vendor_name: string;
  plan_name: string | null;
  monthly_cost_cents: number | null;
  renewal_date: string | null;
  usage_notes: string | null;
  updated_at: string;
}

/** Platform admin only — Nxelio's own paid vendor accounts (Unipile, AnySite, Brevo, etc.), manually tracked. */
export async function getVendorSubscriptions(): Promise<VendorSubscriptionRow[]> {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_vendor_subscriptions")
    .select("*")
    .order("vendor_name", { ascending: true });
  return (data as VendorSubscriptionRow[]) || [];
}

export async function updateVendorSubscription(
  id: string,
  patch: { plan_name?: string | null; monthly_cost_cents?: number | null; renewal_date?: string | null; usage_notes?: string | null }
): Promise<void> {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
  const admin = createAdminClient();
  const { error } = await admin.from("platform_vendor_subscriptions").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin");
}
