"use server";
import { createClient } from "@/lib/supabase/server";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { CLOSED_STAGES, resolveLeadAttribution, type OpportunityRow, type OpportunityStage, type PipelineStats } from "@/lib/opportunities";

export async function getOpportunities(): Promise<OpportunityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as OpportunityRow[]) || [];
}

/** A single lead's opportunities, newest-first — for the lead detail page's related list. */
export async function getOpportunityById(id: string): Promise<OpportunityRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("*").eq("id", id).single();
  return data as OpportunityRow | null;
}

/** A single contact's deals, newest-first — for the "Create New File" modal's Deal picker. */
export async function getOpportunitiesForContact(contactId: string): Promise<OpportunityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  return (data as OpportunityRow[]) || [];
}

/** A single account's deals, newest-first — for the "Create New File" modal's Deal picker. */
export async function getOpportunitiesForAccount(accountId: string): Promise<OpportunityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as OpportunityRow[]) || [];
}

export async function getOpportunitiesForLead(leadId: string): Promise<OpportunityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return (data as OpportunityRow[]) || [];
}

/** Sibling ids (by created_at order) for the detail page's Prev/Next nav. */
export async function getAdjacentOpportunityIds(id: string): Promise<{ prevId: string | null; nextId: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("id")
    .order("created_at", { ascending: false });
  const ids = ((data as { id: string }[]) || []).map((r) => r.id);
  const index = ids.indexOf(id);
  if (index === -1) return { prevId: null, nextId: null };
  return {
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}

export async function getPipelineStats(): Promise<PipelineStats> {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("deal_value, stage");
  const rows = (data as { deal_value: number; stage: OpportunityStage }[]) || [];

  const open = rows.filter((r) => !CLOSED_STAGES.includes(r.stage));
  const won = rows.filter((r) => r.stage === "won");
  const lost = rows.filter((r) => r.stage === "lost");

  const closed = won.length + lost.length;
  return {
    openValue: open.reduce((s, r) => s + Number(r.deal_value || 0), 0),
    openCount: open.length,
    wonValue: won.reduce((s, r) => s + Number(r.deal_value || 0), 0),
    wonCount: won.length,
    lostCount: lost.length,
    winRate: closed ? Math.round((won.length / closed) * 1000) / 10 : 0,
  };
}

export interface CreateOpportunityInput {
  leadId: string;
  name: string;
  company?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  dealValue: number;
  stage?: OpportunityStage;
  expectedCloseDate?: string | null;
  notes?: string | null;
}

/** Convert a lead into a pipeline opportunity, and mark the lead Converted. */
export async function createOpportunityFromLead(input: CreateOpportunityInput): Promise<OpportunityRow> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: leadRow }, attribution] = await Promise.all([
    supabase.from("leads").select("source").eq("id", input.leadId).single(),
    resolveLeadAttribution(supabase, input.leadId),
  ]);

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      lead_id: input.leadId,
      name: input.name,
      company: input.company ?? null,
      contact_name: input.contactName ?? null,
      contact_email: input.contactEmail ?? null,
      deal_value: input.dealValue || 0,
      stage: input.stage || "new",
      expected_close_date: input.expectedCloseDate || null,
      notes: input.notes ?? null,
      owner_id: user?.id ?? null,
      source: (leadRow as { source: string | null } | null)?.source ?? null,
      campaign_id: attribution.campaignId,
      segment_id: attribution.segmentId,
    })
    .select()
    .single();
  if (error) throw error;

  // Reflect conversion on the lead + activity log
  await supabase.from("leads").update({ status: "Converted" }).eq("id", input.leadId);
  await supabase.from("lead_activities").insert({
    lead_id: input.leadId,
    activity_type: "CONVERTED_TO_OPPORTUNITY",
    metadata: { opportunity_id: data.id, deal_value: input.dealValue },
  });

  await notifyCurrentUser({
    type: "opportunity",
    title: "Lead converted to opportunity",
    message: `${input.name}${input.dealValue ? ` — $${input.dealValue.toLocaleString()}` : ""}`,
    link: "/opportunities",
  });

  revalidatePath("/opportunities");
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.created", entityType: "opportunity", entityId: data.id, entityLabel: input.name, metadata: { deal_value: input.dealValue, lead_id: input.leadId } });
  return data as OpportunityRow;
}

export interface CreateOpportunityFromContactInput {
  contactId: string;
  accountId?: string | null;
  name: string;
  company?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  dealValue: number;
  stage?: OpportunityStage;
  pipeline?: string | null;
  currency?: string | null;
  period?: string | null;
  periodValue?: number | null;
  dueDate?: string | null;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  followUpDate?: string | null;
  source?: string | null;
  tags?: string | null;
  priority?: "Low" | "Medium" | "High" | null;
  projects?: string | null;
  notes?: string | null;
}

/** Creates a deal from a Contact's "+ Add Deal" button — links via the real
 *  contact_id/account_id FKs (0084_lead_conversion.sql), not just the
 *  denormalized company/contact_name/contact_email snapshot (kept too, for
 *  consistency with how Leads' converted opportunities already look). */
export async function createOpportunityFromContact(input: CreateOpportunityFromContactInput): Promise<OpportunityRow> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      lead_id: null,
      contact_id: input.contactId,
      account_id: input.accountId ?? null,
      name: input.name,
      company: input.company ?? null,
      contact_name: input.contactName ?? null,
      contact_email: input.contactEmail ?? null,
      deal_value: input.dealValue || 0,
      stage: input.stage || "new",
      pipeline: input.pipeline ?? null,
      currency: input.currency ?? null,
      period: input.period ?? null,
      period_value: input.periodValue ?? null,
      due_date: input.dueDate ?? null,
      expected_close_date: input.expectedCloseDate ?? null,
      follow_up_date: input.followUpDate ?? null,
      source: input.source ?? null,
      tags: input.tags ?? null,
      priority: input.priority ?? null,
      projects: input.projects ?? null,
      notes: input.notes ?? null,
      owner_id: input.ownerId ?? user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await notifyCurrentUser({
    type: "opportunity",
    title: "New deal created",
    message: `${input.name}${input.dealValue ? ` — $${input.dealValue.toLocaleString()}` : ""}`,
    link: "/opportunities",
  });

  revalidatePath("/opportunities");
  revalidatePath(`/contacts/${input.contactId}`);
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.created", entityType: "opportunity", entityId: data.id, entityLabel: input.name, metadata: { deal_value: input.dealValue, contact_id: input.contactId } });
  return data as OpportunityRow;
}

export interface CreateOpportunityFromAccountInput {
  accountId: string;
  contactId?: string | null;
  name: string;
  company?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  dealValue: number;
  stage?: OpportunityStage;
  pipeline?: string | null;
  currency?: string | null;
  period?: string | null;
  periodValue?: number | null;
  dueDate?: string | null;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  followUpDate?: string | null;
  source?: string | null;
  tags?: string | null;
  priority?: "Low" | "Medium" | "High" | null;
  projects?: string | null;
  notes?: string | null;
}

/** Creates a deal from an Account's "+ Add Deal" button — same shape as
 *  createOpportunityFromContact, but contact_id is optional since a deal can
 *  be tied to a company with no specific contact picked yet. */
export async function createOpportunityFromAccount(input: CreateOpportunityFromAccountInput): Promise<OpportunityRow> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      lead_id: null,
      contact_id: input.contactId ?? null,
      account_id: input.accountId,
      name: input.name,
      company: input.company ?? null,
      contact_name: input.contactName ?? null,
      contact_email: input.contactEmail ?? null,
      deal_value: input.dealValue || 0,
      stage: input.stage || "new",
      pipeline: input.pipeline ?? null,
      currency: input.currency ?? null,
      period: input.period ?? null,
      period_value: input.periodValue ?? null,
      due_date: input.dueDate ?? null,
      expected_close_date: input.expectedCloseDate ?? null,
      follow_up_date: input.followUpDate ?? null,
      source: input.source ?? null,
      tags: input.tags ?? null,
      priority: input.priority ?? null,
      projects: input.projects ?? null,
      notes: input.notes ?? null,
      owner_id: input.ownerId ?? user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await notifyCurrentUser({
    type: "opportunity",
    title: "New deal created",
    message: `${input.name}${input.dealValue ? ` — $${input.dealValue.toLocaleString()}` : ""}`,
    link: "/opportunities",
  });

  revalidatePath("/opportunities");
  revalidatePath(`/accounts/${input.accountId}`);
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.created", entityType: "opportunity", entityId: data.id, entityLabel: input.name, metadata: { deal_value: input.dealValue, account_id: input.accountId } });
  return data as OpportunityRow;
}

/** Move an opportunity to a new pipeline stage (used by the board drag/drop). */
export async function moveOpportunityStage(id: string, stage: OpportunityStage): Promise<void> {
  const supabase = await createClient();
  const closed = CLOSED_STAGES.includes(stage);
  const { error } = await supabase
    .from("opportunities")
    .update({
      stage,
      closed_at: closed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.stage_moved", entityType: "opportunity", entityId: id, metadata: { stage } });
}

export interface UpdateOpportunityInput {
  name?: string;
  company?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  dealValue?: number;
  stage?: OpportunityStage;
  expectedCloseDate?: string | null;
  notes?: string | null;
}

export async function updateOpportunity(id: string, input: UpdateOpportunityInput): Promise<void> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.company !== undefined) patch.company = input.company;
  if (input.contactName !== undefined) patch.contact_name = input.contactName;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.dealValue !== undefined) patch.deal_value = input.dealValue;
  if (input.expectedCloseDate !== undefined) patch.expected_close_date = input.expectedCloseDate || null;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.stage !== undefined) {
    patch.stage = input.stage;
    patch.closed_at = CLOSED_STAGES.includes(input.stage) ? new Date().toISOString() : null;
  }
  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.updated", entityType: "opportunity", entityId: id, metadata: patch });
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  await logAudit({ action: "opportunity.deleted", entityType: "opportunity", entityId: id });
}
