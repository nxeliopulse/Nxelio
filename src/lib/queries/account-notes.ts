"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Note bodies are rich text (HTML) from the TipTap editor. The actual XSS
 *  defense is the client-side DOMPurify sanitize that always runs before
 *  rendering via dangerouslySetInnerHTML (account-notes-card.tsx) — sanitizing
 *  here too would need jsdom, which Next.js's serverless bundle can't load. */
function sanitizeBody(html: string): string {
  return html.trim();
}

export interface AccountNoteFile {
  id: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
}

export interface AccountNoteComment {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface AccountNoteRow {
  id: string;
  account_id: string;
  author_name: string | null;
  title: string | null;
  body: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  files: AccountNoteFile[];
  comments: AccountNoteComment[];
}

const BUCKET = "account-notes";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const SELECT = "*, files:account_note_files(id, file_url, file_name, file_size), comments:account_note_comments(id, author_name, body, created_at)";

export async function getAccountNotes(accountId: string): Promise<AccountNoteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_notes")
    .select(SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as unknown as AccountNoteRow[]) || [];
}

/** Adds a note to an account, with optional file attachments (FormData field "files", possibly repeated). */
export async function createAccountNote(accountId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const title = String(formData.get("title") || "").trim() || null;
  const rawBody = String(formData.get("body") || "").trim();
  const isEmptyHtml = !rawBody || rawBody === "<p></p>";
  if (isEmptyHtml && files.length === 0) return { ok: false, error: "Note can't be empty" };
  const body = sanitizeBody(isEmptyHtml ? "<p>Attached a file</p>" : rawBody);
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return { ok: false, error: `"${f.name}" is too large (max 50MB)` };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("users").select("full_name, email").eq("user_id", user.id).single();
  const authorName = profile?.full_name || profile?.email || "Unknown";

  const { data: note, error } = await supabase
    .from("account_notes")
    .insert({ account_id: accountId, author_name: authorName, title, body })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (files.length) {
    const admin = createAdminClient();
    const uploaded: { note_id: string; file_url: string; file_name: string; file_size: number }[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploadErr) continue; // best-effort: note is already saved, skip a failed file rather than losing the note
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({ note_id: note.id, file_url: pub.publicUrl, file_name: file.name, file_size: file.size });
    }
    if (uploaded.length) await supabase.from("account_note_files").insert(uploaded);
  }

  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

export async function updateAccountNote(id: string, accountId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed || trimmed === "<p></p>") return { ok: false, error: "Note can't be empty" };
  const supabase = await createClient();
  const { error } = await supabase.from("account_notes").update({ body: sanitizeBody(trimmed) }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

export async function deleteAccountNote(id: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("account_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

export async function addAccountNoteComment(noteId: string, accountId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Comment can't be empty" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("users").select("full_name, email").eq("user_id", user.id).single();
  const authorName = profile?.full_name || profile?.email || "Unknown";

  const { error } = await supabase.from("account_note_comments").insert({ note_id: noteId, author_name: authorName, body: trimmed });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}
