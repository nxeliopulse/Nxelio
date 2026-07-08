"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface BlocklistEntry {
  id: string;
  value: string;
  reason: string | null;
  created_at: string;
}

export async function getBlocklist(): Promise<BlocklistEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("blocklist").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function addBlocklistEntry(value: string, reason?: string) {
  const supabase = await createClient();
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Value required");
  const { error } = await supabase.from("blocklist").insert({ value: trimmed.toLowerCase(), reason: reason || null });
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

export async function removeBlocklistEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("blocklist").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

/** Server check whether an email is blocked. Used at send time. */
export async function isBlocked(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const lower = email.toLowerCase();
  const domain = "@" + lower.split("@")[1];
  const { data } = await admin.from("blocklist").select("value").in("value", [lower, domain]).limit(1);
  return (data?.length ?? 0) > 0;
}
