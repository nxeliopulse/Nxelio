"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type NewsletterStatus = "Draft" | "Scheduled" | "Sending" | "Sent" | "Failed";

export interface NewsletterBlock {
  type: "heading" | "paragraph" | "image" | "cta" | "divider";
  text?: string;
  url?: string;
  alt?: string;
}

export interface NewsletterContent {
  blocks: NewsletterBlock[];
}

export interface NewsletterRow {
  id: string;
  title: string;
  subject: string | null;
  preheader: string | null;
  content: NewsletterContent;
  status: NewsletterStatus;
  audience_type: "all" | "segment";
  segment_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  sent_count: number;
  open_count: number;
  click_count: number;
  created_at: string;
  updated_at: string;
}

export async function getNewsletters(): Promise<NewsletterRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("newsletters")
    .select("*")
    .order("updated_at", { ascending: false });
  return (data as NewsletterRow[]) || [];
}

export async function getNewsletterStats() {
  const supabase = await createClient();
  const { data } = await supabase.from("newsletters").select("status, sent_count, open_count, click_count");
  if (!data) return { total: 0, sent: 0, avgOpenRate: 0, avgClickRate: 0 };
  const sentNewsletters = data.filter((n) => n.sent_count > 0);
  const total = data.length;
  const sent = sentNewsletters.length;
  const avgOpenRate = sentNewsletters.length
    ? Math.round(sentNewsletters.reduce((s, n) => s + (n.open_count / Math.max(1, n.sent_count)) * 100, 0) / sentNewsletters.length * 10) / 10
    : 0;
  const avgClickRate = sentNewsletters.length
    ? Math.round(sentNewsletters.reduce((s, n) => s + (n.click_count / Math.max(1, n.sent_count)) * 100, 0) / sentNewsletters.length * 10) / 10
    : 0;
  return { total, sent, avgOpenRate, avgClickRate };
}

export async function getNewsletterById(id: string): Promise<NewsletterRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("newsletters").select("*").eq("id", id).single();
  return (data as NewsletterRow) || null;
}

export async function createNewsletter(payload: Partial<NewsletterRow>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .insert({
      title: payload.title || "Untitled newsletter",
      subject: payload.subject || null,
      preheader: payload.preheader || null,
      content: payload.content || { blocks: [] },
      status: payload.status || "Draft",
      audience_type: payload.audience_type || "all",
      segment_id: payload.segment_id || null,
      scheduled_at: payload.scheduled_at || null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/newsletters");
  return data as NewsletterRow;
}

export async function updateNewsletter(id: string, payload: Partial<NewsletterRow>) {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.subject !== undefined) update.subject = payload.subject;
  if (payload.preheader !== undefined) update.preheader = payload.preheader;
  if (payload.content !== undefined) update.content = payload.content;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.audience_type !== undefined) update.audience_type = payload.audience_type;
  if (payload.segment_id !== undefined) update.segment_id = payload.segment_id;
  if (payload.scheduled_at !== undefined) update.scheduled_at = payload.scheduled_at;
  const { error } = await supabase.from("newsletters").update(update).eq("id", id);
  if (error) throw error;
  revalidatePath("/newsletters");
  revalidatePath(`/newsletters/builder`);
}

export async function deleteNewsletter(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("newsletters").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/newsletters");
}

export async function duplicateNewsletter(id: string) {
  const supabase = await createClient();
  const { data: orig } = await supabase.from("newsletters").select("*").eq("id", id).single();
  if (!orig) throw new Error("Newsletter not found");
  const {
    id: _id, created_at: _c, updated_at: _u, sent_at: _s, scheduled_at: _sa,
    sent_count: _sc, open_count: _oc, click_count: _cc, recipient_count: _rc,
    owner_id: _oid,
    ...rest
  } = orig;
  void _id; void _c; void _u; void _s; void _sa; void _sc; void _oc; void _cc; void _rc; void _oid;
  await supabase.from("newsletters").insert({ ...rest, title: orig.title + " (copy)", status: "Draft" });
  revalidatePath("/newsletters");
}
