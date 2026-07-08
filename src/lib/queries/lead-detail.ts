"use server";
import { createClient } from "@/lib/supabase/server";

export async function getLeadDetail(id: string) {
  const supabase = await createClient();
  const [{ data: lead }, { data: activities }, { data: messages }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("inbox_messages").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  return { lead, activities: activities || [], messages: messages || [] };
}
