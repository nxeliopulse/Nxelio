"use server";
import { createClient } from "@/lib/supabase/server";

export interface TourState {
  /** pageKey -> version string of the tour last completed/skipped on that page. */
  seenTours: Record<string, string>;
}

const EMPTY: TourState = { seenTours: {} };

/** Fail-open like getOnboarding()/hasConnectedMailbox(): a query hiccup must
 *  never repeatedly nag a user with the same tour, so on error we return
 *  "state unknown" and the caller treats every page as already-seen. */
export async function getTourState(): Promise<TourState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY;
  const { data, error } = await supabase.from("users").select("tour_state").eq("user_id", user.id).single();
  if (error) return EMPTY;
  const state = (data?.tour_state as Partial<TourState>) ?? {};
  return { seenTours: state.seenTours ?? {} };
}

/** Marks one page's tour as seen at a given version. Read-modify-write on the
 *  small JSON blob — an occasional lost update under concurrent writes is an
 *  acceptable tradeoff for a cosmetic "don't show this again" flag. */
export async function markTourSeen(pageKey: string, version: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const current = await getTourState();
  const next: TourState = { seenTours: { ...current.seenTours, [pageKey]: version } };
  const { error } = await supabase.from("users").update({ tour_state: next }).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
