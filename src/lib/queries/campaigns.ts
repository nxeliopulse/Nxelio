"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CampaignRow {
  id: string;
  campaign_name: string;
  campaign_type: string | null;
  segment_id: string | null;
  subject: string | null;
  content: string | null;
  status: string;
  sent_count: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCampaigns(): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").order("updated_at", { ascending: false });
  return data || [];
}

export async function getCampaignStats() {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("status, sent_count, open_rate, reply_rate");
  if (!data) return { active: 0, totalSent: 0, avgOpen: 0, avgReply: 0 };
  const active = data.filter((c) => c.status === "Active").length;
  const totalSent = data.reduce((sum, c) => sum + (c.sent_count || 0), 0);
  const activeCampaigns = data.filter((c) => c.sent_count > 0);
  const avgOpen = activeCampaigns.length ? activeCampaigns.reduce((s, c) => s + Number(c.open_rate || 0), 0) / activeCampaigns.length : 0;
  const avgReply = activeCampaigns.length ? activeCampaigns.reduce((s, c) => s + Number(c.reply_rate || 0), 0) / activeCampaigns.length : 0;
  return { active, totalSent, avgOpen: Math.round(avgOpen * 10) / 10, avgReply: Math.round(avgReply * 10) / 10 };
}

export async function getCampaignById(id: string): Promise<CampaignRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();
  return data;
}

/** Count of follow-up steps queued but not yet sent for this campaign. */
export async function getCampaignPendingCount(campaignId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("campaign_jobs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  return count || 0;
}

/** The leads this campaign was actually sent to (distinct outbound recipients), + its name. */
export async function getCampaignRecipients(campaignId: string): Promise<{ name: string | null; leadIds: string[] }> {
  const supabase = await createClient();
  const [{ data: campaign }, { data: msgs }] = await Promise.all([
    supabase.from("campaigns").select("campaign_name").eq("id", campaignId).single(),
    supabase.from("inbox_messages").select("lead_id").eq("campaign_id", campaignId).eq("direction", "outbound"),
  ]);
  const leadIds = [...new Set((msgs || []).map((m) => m.lead_id).filter(Boolean))] as string[];
  return { name: campaign?.campaign_name ?? null, leadIds };
}

export async function createCampaign(payload: Partial<CampaignRow>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ campaign_name: payload.campaign_name || "Untitled Campaign", status: "Draft", ...payload })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/campaigns");
  return data;
}

export async function updateCampaign(id: string, payload: Partial<CampaignRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/campaigns");
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/campaigns");
}

export async function setCampaignStatus(id: string, status: string) {
  return updateCampaign(id, { status });
}

export async function duplicateCampaign(id: string) {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Campaign not found");

  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = existing;
  void _id; void _createdAt; void _updatedAt;

  const copy = {
    ...rest,
    campaign_name: `${existing.campaign_name} (copy)`,
    status: "Draft",
    sent_count: 0,
    open_rate: 0,
    reply_rate: 0,
    bounce_rate: 0,
  };

  const { data, error } = await supabase.from("campaigns").insert(copy).select().single();
  if (error) throw error;
  revalidatePath("/campaigns");
  return data;
}
