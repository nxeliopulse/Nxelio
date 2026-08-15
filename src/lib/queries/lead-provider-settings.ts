"use server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { type LeadProviderName } from "@/lib/leads/provider";
import { anysiteConfigured } from "@/lib/leads/anysite";
import { brightDataConfigured } from "@/lib/leads/bright-data";
import { revalidatePath } from "next/cache";

export interface LeadProviderStatus {
  activeProvider: LeadProviderName;
  updatedAt: string | null;
  providers: { provider: LeadProviderName; configured: boolean }[];
}

export async function getLeadProviderStatus(): Promise<LeadProviderStatus> {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
  const admin = createAdminClient();
  const { data } = await admin.from("lead_provider_settings").select("active_provider, updated_at").eq("id", 1).maybeSingle();
  return {
    activeProvider: data?.active_provider === "anysite" ? "anysite" : "bright_data",
    updatedAt: data?.updated_at ?? null,
    providers: [
      { provider: "anysite", configured: anysiteConfigured },
      { provider: "bright_data", configured: brightDataConfigured },
    ],
  };
}

export async function setActiveLeadProvider(provider: LeadProviderName): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("lead_provider_settings")
    .update({ active_provider: provider, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
