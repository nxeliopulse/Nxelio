"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface AccountTaskRow {
  id: string;
  account_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  reminder: string | null;
  priority: "Low" | "Medium" | "High";
  assigned_to: string | null;
  status: "pending" | "done";
  created_at: string;
}

export async function getAccountTasks(accountId: string): Promise<AccountTaskRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_tasks")
    .select("*")
    .eq("account_id", accountId)
    .order("due_at", { ascending: true, nullsFirst: false });
  return (data as AccountTaskRow[]) || [];
}

/** Creates a new task/reminder against an account. */
export async function createAccountTask(input: {
  account_id: string;
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
  const { error } = await supabase.from("account_tasks").insert({
    account_id: input.account_id,
    title,
    description: input.description?.trim() || null,
    due_at: input.due_at || null,
    reminder: input.reminder || null,
    priority: input.priority,
    assigned_to: input.assigned_to || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/accounts/${input.account_id}`);
  return { ok: true };
}

export async function updateAccountTask(
  id: string,
  accountId: string,
  patch: Partial<Pick<AccountTaskRow, "reminder" | "priority" | "assigned_to">>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("account_tasks").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

export async function updateAccountTaskStatus(
  id: string,
  accountId: string,
  status: "pending" | "done"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("account_tasks").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

export async function deleteAccountTask(id: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("account_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}
