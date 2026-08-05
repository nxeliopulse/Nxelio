"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { CallOutcome } from "@/lib/contact-calls-constants";

export interface ContactCallRow {
  id: string;
  contact_id: string;
  author_name: string | null;
  outcome: CallOutcome;
  notes: string | null;
  call_time: string;
  created_at: string;
}

export async function getContactCalls(contactId: string): Promise<ContactCallRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_calls")
    .select("*")
    .eq("contact_id", contactId)
    .order("call_time", { ascending: false });
  return (data as ContactCallRow[]) || [];
}

export async function createContactCall(contactId: string, input: { outcome: CallOutcome; notes?: string | null; call_time?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("users").select("full_name, email").eq("user_id", user.id).single();
  const authorName = profile?.full_name || profile?.email || "Unknown";

  const { error } = await supabase.from("contact_calls").insert({
    contact_id: contactId,
    author_name: authorName,
    outcome: input.outcome,
    notes: input.notes?.trim() || null,
    call_time: input.call_time || new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function updateContactCallOutcome(id: string, contactId: string, outcome: CallOutcome): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_calls").update({ outcome }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function deleteContactCall(id: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_calls").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
