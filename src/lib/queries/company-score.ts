"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface CompanyScoreResult {
  score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  /** False when the website couldn't be reached — the score was based on
   *  onboarding data alone, so the UI should say so honestly. */
  websiteFetched: boolean;
  generatedAt: string;
}

async function currentWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  return profile?.workspace_id ?? null;
}

/** Last-generated Company Score for the current workspace, or null if one's
 *  never been generated. Cheap read — used to render Settings on load
 *  without triggering a fresh AI call. */
export async function getCompanyScore(): Promise<CompanyScoreResult | null> {
  const wsId = await currentWorkspaceId();
  if (!wsId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select("company_score").eq("id", wsId).maybeSingle();
  return (data?.company_score as CompanyScoreResult | null) ?? null;
}

/** Persists a freshly-generated score. Admin client — same reasoning as
 *  saveOnboarding() in onboarding.ts: the workspaces UPDATE policy is
 *  owner-only, and this is non-sensitive workspace config a member should
 *  still be able to refresh. */
export async function saveCompanyScore(result: CompanyScoreResult): Promise<void> {
  const wsId = await currentWorkspaceId();
  if (!wsId) return;
  const admin = createAdminClient();
  await admin.from("workspaces").update({ company_score: result }).eq("id", wsId);
}
