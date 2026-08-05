"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const MAX_HISTORY = 20;

export interface AiPromptHistoryRow {
  id: string;
  prompt: string;
  created_at: string;
}

/** Records a generated prompt and trims this user's history back down to
 *  the most recent MAX_HISTORY — called best-effort from generateSegmentRules,
 *  never blocks or fails a generation if it errors. */
export async function saveAiPromptHistory(prompt: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("ai_segment_prompt_history").insert({ user_id: user.id, prompt });

  const { data: rows } = await supabase
    .from("ai_segment_prompt_history")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const stale = (rows || []).slice(MAX_HISTORY).map((r) => r.id);
  if (stale.length) await supabase.from("ai_segment_prompt_history").delete().in("id", stale);
}

export async function getAiPromptHistory(): Promise<AiPromptHistoryRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("ai_segment_prompt_history")
    .select("id, prompt, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);
  return data || [];
}

export async function deleteAiPromptHistoryItem(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("ai_segment_prompt_history").delete().eq("id", id);
  revalidatePath("/segments/builder");
}
