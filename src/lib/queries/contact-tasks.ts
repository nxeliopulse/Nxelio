"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ContactTaskRow {
  id: string;
  contact_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  reminder: string | null;
  priority: "Low" | "Medium" | "High";
  assigned_to: string | null;
  status: "pending" | "done";
  created_at: string;
}

export async function getContactTasks(contactId: string): Promise<ContactTaskRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_tasks")
    .select("*")
    .eq("contact_id", contactId)
    .order("due_at", { ascending: true, nullsFirst: false });
  return (data as ContactTaskRow[]) || [];
}

/** Creates a new task/reminder against a contact. */
export async function createContactTask(input: {
  contact_id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  reminder?: string | null;
  priority: "Low" | "Medium" | "High";
  assigned_to?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title can't be empty" };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_tasks").insert({
    contact_id: input.contact_id,
    title,
    description: input.description?.trim() || null,
    due_at: input.due_at || null,
    reminder: input.reminder || null,
    priority: input.priority,
    assigned_to: input.assigned_to || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/contacts/${input.contact_id}`);
  return { ok: true };
}

export async function updateContactTask(
  id: string,
  contactId: string,
  patch: Partial<Pick<ContactTaskRow, "reminder" | "priority" | "assigned_to">>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tasks").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function updateContactTaskStatus(
  id: string,
  contactId: string,
  status: "pending" | "done"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tasks").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function deleteContactTask(id: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
