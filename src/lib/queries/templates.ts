"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
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
  await logAudit({ action: "template.created", entityType: "email_template", entityId: data.id, entityLabel: data.template_name });
  return data;
}

export async function updateEmailTemplate(id: string, payload: Partial<EmailTemplateRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/templates");
  await logAudit({ action: "template.updated", entityType: "email_template", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteEmailTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/templates");
  await logAudit({ action: "template.deleted", entityType: "email_template", entityId: id });
}
