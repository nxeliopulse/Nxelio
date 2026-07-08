"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface EmailTemplateRow {
  id: string;
  template_name: string;
  subject: string | null;
  body: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getEmailTemplates(): Promise<EmailTemplateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  return data || [];
}

export async function createEmailTemplate(payload: Partial<EmailTemplateRow>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({ template_name: payload.template_name || "Untitled", ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/templates");
  return data;
}

export async function updateEmailTemplate(id: string, payload: Partial<EmailTemplateRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/templates");
}

export async function deleteEmailTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/templates");
}
