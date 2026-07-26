"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface LeadNoteRow {
  id: string;
  lead_id: string;
  author_name: string | null;
  body: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

const BUCKET = "lead-notes";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export async function getLeadNotes(leadId: string): Promise<LeadNoteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return (data as LeadNoteRow[]) || [];
}

/** Adds a note to a lead, with an optional file attachment (FormData field "file"). */
export async function createLeadNote(leadId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Note can't be empty" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("users").select("full_name, email").eq("user_id", user.id).single();
  const authorName = profile?.full_name || profile?.email || "Unknown";

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  const file = formData.get("file") as File | null;
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "File too large (max 10MB)" };
    const admin = createAdminClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${leadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadErr) return { ok: false, error: uploadErr.message };
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    fileUrl = pub.publicUrl;
    fileName = file.name;
  }

  const { error } = await supabase.from("lead_notes").insert({
    lead_id: leadId,
    author_name: authorName,
    body,
    file_url: fileUrl,
    file_name: fileName,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteLeadNote(id: string, leadId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
