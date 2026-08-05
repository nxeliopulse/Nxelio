"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { DocType, DocStatus } from "@/lib/contact-documents-constants";

export interface ContactDocumentRecipient {
  id: string;
  name: string;
  email: string;
  signed: boolean;
  signed_at: string | null;
}

export interface ContactDocumentRow {
  id: string;
  contact_id: string;
  opportunity_id: string | null;
  title: string;
  doc_type: DocType;
  status: DocStatus;
  owner_id: string | null;
  file_url: string | null;
  file_name: string | null;
  content: string | null;
  signature_required: boolean;
  created_at: string;
  recipients: ContactDocumentRecipient[];
}

const BUCKET = "contact-documents";
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const SELECT = "*, recipients:contact_document_recipients(id, name, email, signed, signed_at)";

export async function getContactDocuments(contactId: string): Promise<ContactDocumentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_documents")
    .select(SELECT)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  return (data as unknown as ContactDocumentRow[]) || [];
}

/** Creates a document — either an uploaded file, typed Content, or both. If
 *  "signature_required" is set (FormData "1"), a JSON "recipients" field
 *  ([{name,email}]) is recorded for MANUAL signed tracking only — no real
 *  e-signature provider is integrated; nothing here is legally binding (see
 *  0107's migration comment). */
export async function createContactDocument(contactId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const title = String(formData.get("title") || "").trim();
  if (!title) return { ok: false, error: "Title is required" };
  const docType = String(formData.get("doc_type") || "Proposal") as DocType;
  const status = String(formData.get("status") || "Draft") as DocStatus;
  const ownerId = String(formData.get("owner_id") || "") || null;
  const opportunityId = String(formData.get("opportunity_id") || "") || null;
  const content = String(formData.get("content") || "").trim() || null;
  const signatureRequired = formData.get("signature_required") === "1";
  const recipients: { name: string; email: string }[] = JSON.parse(String(formData.get("recipients") || "[]"));
  const file = formData.get("file") as File | null;

  if (!content && (!file || file.size === 0)) return { ok: false, error: "Add either Content or a file" };
  const validRecipients = recipients.filter((r) => r.name.trim() && r.email.trim());
  if (signatureRequired && validRecipients.length === 0) {
    return { ok: false, error: "At least one recipient (name + email) is required for e-signature" };
  }

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "File too large (max 15MB)" };
    const admin = createAdminClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${contactId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadErr) return { ok: false, error: uploadErr.message };
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    fileUrl = pub.publicUrl;
    fileName = file.name;
  }

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("contact_documents")
    .insert({
      contact_id: contactId,
      opportunity_id: opportunityId,
      title,
      doc_type: docType,
      status,
      owner_id: ownerId,
      content,
      file_url: fileUrl,
      file_name: fileName,
      signature_required: signatureRequired,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (signatureRequired && validRecipients.length) {
    const rows = validRecipients.map((r) => ({ document_id: doc.id, name: r.name.trim(), email: r.email.trim() }));
    await supabase.from("contact_document_recipients").insert(rows);
  }

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function updateContactDocumentStatus(id: string, contactId: string, status: DocStatus): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_documents").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

/** Manually marks a recipient signed — a tracking flag only, not a real
 *  e-signature (see the migration comment on 0107). */
export async function markRecipientSigned(recipientId: string, contactId: string, signed: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_document_recipients")
    .update({ signed, signed_at: signed ? new Date().toISOString() : null })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function deleteContactDocument(id: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
