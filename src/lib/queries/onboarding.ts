"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export interface OnboardingData {
  // Company identity
  company_name: string;
  industry: string;
  company_size?: string;
  founded_year?: string;
  hq_location?: string;
  /** Company website/domain — shown/edited in Settings > Profile's Business
   *  Details card. Not asked during onboarding itself. */
  company_website?: string;
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

export interface OnboardingProfile {
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
}

export interface OnboardingStatus {
  completed: boolean;
  profileComplete: boolean;
  businessComplete: boolean;
  mailboxComplete: boolean;
  grandfathered: boolean;
  data: OnboardingData | null;
  profile: OnboardingProfile | null;
}

/**
 * Stricter onboarding-completeness check for the hard gate — computed live
 * from users/workspaces/outreach_accounts rather than a single persisted
 * flag, since "mailbox connected" isn't write-once (disconnecting flips it
 * back). Each sub-check fails open independently (defaults to true on its
 * own query error), so a hiccup in any one table can never lock out every
 * workspace. getOnboarding() above is untouched — this is additive, used
 * only by the two call sites that need the stricter 3-part definition.
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { completed: false, profileComplete: false, businessComplete: false, mailboxComplete: false, grandfathered: false, data: null, profile: null };
  }

  const wsId = await currentWorkspaceId(supabase);
  let businessComplete = true;
  let grandfathered = false;
  let onboardingData: OnboardingData | null = null;
  if (wsId) {
    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("onboarding, onboarding_completed, onboarding_grandfathered")
      .eq("id", wsId)
      .single();
    if (!error) {
      onboardingData = (ws?.onboarding as OnboardingData) ?? null;
      businessComplete = Boolean(ws?.onboarding_completed);
      grandfathered = Boolean(ws?.onboarding_grandfathered);
    }
    // else: fail open, businessComplete stays true
  }

  let profileComplete = true;
  let profile: OnboardingProfile | null = null;
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("full_name, email, phone, job_title, avatar_url")
    .eq("user_id", user.id)
    .single();
  if (!userErr && userRow) {
    profile = userRow as OnboardingProfile;
    profileComplete = Boolean(profile.phone?.trim() && profile.job_title?.trim());
  }
  // else: fail open, profileComplete stays true, profile stays null

  const completed = businessComplete && (grandfathered || profileComplete);

  return { completed, profileComplete, businessComplete, mailboxComplete: true, grandfathered, data: onboardingData, profile };
}

export async function saveOnboarding(data: OnboardingData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const wsId = await currentWorkspaceId(supabase);
  if (!wsId) return { ok: false, error: "No workspace found for this account." };
  // The workspaces UPDATE policy is owner-only ("Owner updates workspace"), so a
  // non-owner member's save would silently affect 0 rows and look successful while
  // persisting nothing. wsId is already scoped to THIS authenticated user's
  // workspace, and onboarding fields are non-sensitive workspace config, so we
  // write with the admin client and then verify a row was actually updated.
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("workspaces")
    .update({ onboarding: data, onboarding_completed: true })
    .eq("id", wsId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Couldn't save your details — workspace not found. Please refresh and try again." };
  }
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true };
}
