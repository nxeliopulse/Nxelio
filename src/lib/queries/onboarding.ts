"use server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export interface OnboardingData {
  // Company identity
  company_name: string;
  industry: string;
  company_size?: string;
  founded_year?: string;
  hq_location?: string;
  annual_revenue?: string;
  goals: string[];
  company_description?: string;
  // Sales context
  target_customer_type: string; // "B2B" | "B2C" | "Both"
  avg_deal_size?: string;
  sales_cycle?: string;
  primary_product: string;
  key_competitors?: string;
}

async function currentWorkspaceId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();
  return profile?.workspace_id ?? null;
}

export async function getOnboarding(): Promise<{ data: OnboardingData | null; completed: boolean }> {
  const supabase = await createClient();
  const wsId = await currentWorkspaceId(supabase);
  if (!wsId) return { data: null, completed: false };
  const { data, error } = await supabase
    .from("workspaces")
    .select("onboarding, onboarding_completed")
    .eq("id", wsId)
    .single();
  // Fail-open: if the columns don't exist yet (migration 0028 not applied) or the
  // query errors, treat onboarding as complete so the app isn't bricked behind the gate.
  if (error) return { data: null, completed: true };
  return {
    data: (data?.onboarding as OnboardingData) ?? null,
    completed: Boolean(data?.onboarding_completed),
  };
}

export async function saveOnboarding(data: OnboardingData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const wsId = await currentWorkspaceId(supabase);
  if (!wsId) return { ok: false, error: "No workspace found for this account." };
  const { error } = await supabase
    .from("workspaces")
    .update({ onboarding: data, onboarding_completed: true })
    .eq("id", wsId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true };
}
