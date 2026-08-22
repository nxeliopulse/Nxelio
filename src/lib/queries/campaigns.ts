"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { hasConnectedOutreachChannel } from "@/lib/queries/outreach-accounts";
import { revalidatePath } from "next/cache";

const NO_OUTREACH_ACCOUNT_MESSAGE =
  "Connect an email or LinkedIn account before creating, editing, or running campaigns. Go to Outreach → Accounts to connect one.";

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
  content_is_html: boolean;
  pause_same_company_on_reply: boolean;
  scheduled_at: string | null;
  approval_status: string;
  /** True only when the sequence content was produced via the AI generator — shown as its
   *  own badge, independent of approval_status (which just tracks the review lifecycle). */
  generated_by_ai: boolean;
  /** When false, this campaign can launch directly without going through the review/approval lifecycle. */
  requires_approval: boolean;
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

export interface LeadCampaignSummary {
  id: string;
  campaign_name: string;
  status: string;
  approval_status: string;
  /** Earliest still-pending outreach_jobs.run_at for this lead in this
   *  campaign — the real "next follow-up" date, null if nothing is queued. */
  next_follow_up_at: string | null;
}

/** Every campaign that has actually sent this lead something — derived from
 *  inbox_messages (each real send is logged there with campaign_id + lead_id),
 *  not from audience targeting rules, so this only lists campaigns the lead
 *  was genuinely part of. */
export async function getCampaignsForLead(leadId: string): Promise<LeadCampaignSummary[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("inbox_messages")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .not("campaign_id", "is", null);
  const campaignIds = [...new Set((rows || []).map((r) => r.campaign_id as string))];
  if (!campaignIds.length) return [];

  const [{ data: campaigns }, { data: enrollments }] = await Promise.all([
    supabase.from("campaigns").select("id, campaign_name, status, approval_status").in("id", campaignIds),
    supabase
      .from("campaign_enrollments")
      .select("campaign_id, next_execution_at")
      .eq("lead_id", leadId)
      .in("campaign_id", campaignIds)
      .not("next_execution_at", "is", null),
  ]);

  const nextByCampaign = new Map<string, string>((enrollments || []).map((e) => [e.campaign_id as string, e.next_execution_at as string]));

  return ((campaigns as Omit<LeadCampaignSummary, "next_follow_up_at">[]) || []).map((c) => ({
    ...c,
    next_follow_up_at: nextByCampaign.get(c.id) || null,
  }));
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
  if (!(await hasConnectedOutreachChannel())) throw new Error(NO_OUTREACH_ACCOUNT_MESSAGE);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ campaign_name: payload.campaign_name || "Untitled Campaign", status: "Draft", approval_status: "Draft", generated_by_ai: false, ...payload })
    .select()
    .single();
  // Throw a real Error (not the raw Postgrest object) — plain objects thrown from
  // a server action can lose their message crossing back to the client, which
  // then shows up as a blank/"null" error instead of the actual DB message.
  if (error) throw new Error(error.message || "Couldn't create the campaign.");
  revalidatePath("/campaigns");
  await logAudit({ action: "campaign.created", entityType: "campaign", entityId: data.id, entityLabel: data.campaign_name });
  return data;
}

export async function updateCampaign(id: string, payload: Partial<CampaignRow>) {
  if (!(await hasConnectedOutreachChannel())) throw new Error(NO_OUTREACH_ACCOUNT_MESSAGE);
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(payload).eq("id", id);
  if (error) throw new Error(error.message || "Couldn't update the campaign.");
  revalidatePath("/campaigns");
  await logAudit({ action: "campaign.updated", entityType: "campaign", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/campaigns");
  await logAudit({ action: "campaign.deleted", entityType: "campaign", entityId: id });
}

export async function setCampaignStatus(id: string, status: string) {
  return updateCampaign(id, { status });
}

export async function duplicateCampaign(id: string) {
  if (!(await hasConnectedOutreachChannel())) throw new Error(NO_OUTREACH_ACCOUNT_MESSAGE);
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
  await logAudit({ action: "campaign.duplicated", entityType: "campaign", entityId: data.id, entityLabel: data.campaign_name, metadata: { duplicated_from: id } });
  return data;
}
