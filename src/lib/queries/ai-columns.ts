"use server";
import { createClient } from "@/lib/supabase/server";
import { getLeads } from "@/lib/queries/leads";
import { aiChat } from "@/lib/ai/client";
import { findEmailByLinkedIn, findEmailsByLinkedIn } from "@/lib/leads/anysite";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";
import { buildAiColumnPrompt, detectAiColumnActionType, type AiColumnOutputType, type AiColumnActionType } from "@/lib/leads/ai-column-templates";
import { revalidatePath } from "next/cache";

export interface AiColumnDefinitionRow {
  id: string;
  name: string;
  description: string | null;
  prompt_template: string;
  output_type: AiColumnOutputType;
  action_type: AiColumnActionType;
  source_template_id: string | null;
  column_order: number;
  created_at: string;
  updated_at: string;
}

export interface AiColumnSavedTemplateRow {
  id: string;
  name: string;
  description: string | null;
  prompt_template: string | null;
  output_type: AiColumnOutputType;
  action_type: AiColumnActionType;
  created_at: string;
}

/** Lightweight poll target for a "Run on all leads" progress bar — how many of the
 *  workspace's leads already have a value for this column vs. the total. */
export async function getAiColumnProgress(columnId: string): Promise<{ done: number; total: number }> {
  const leads = await getLeads();
  const done = leads.filter((l) => l.custom_fields && l.custom_fields[columnId] !== undefined).length;
  return { done, total: leads.length };
}

export async function getAiColumns(): Promise<AiColumnDefinitionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_column_definitions")
    .select("*")
    .order("column_order", { ascending: true });
  return data ?? [];
}

export async function getAiColumnSavedTemplates(): Promise<AiColumnSavedTemplateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_column_saved_templates")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deleteAiColumnSavedTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_column_saved_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function createAiColumn(input: {
  name: string;
  description?: string;
  prompt_template: string;
  output_type: AiColumnOutputType;
  action_type?: AiColumnActionType;
  source_template_id?: string | null;
  saveAsTemplate?: boolean;
}): Promise<AiColumnDefinitionRow> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("ai_column_definitions").select("column_order").order("column_order", { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.column_order ?? -1) + 1;
  const actionType = input.action_type ?? detectAiColumnActionType(input.prompt_template);

  const { data, error } = await supabase
    .from("ai_column_definitions")
    .insert({
      name: input.name,
      description: input.description ?? null,
      prompt_template: input.prompt_template,
      output_type: input.output_type,
      action_type: actionType,
      source_template_id: input.source_template_id ?? null,
      column_order: nextOrder,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.saveAsTemplate) {
    await supabase.from("ai_column_saved_templates").insert({
      name: input.name,
      description: input.description ?? null,
      prompt_template: input.prompt_template,
      output_type: input.output_type,
      action_type: actionType,
    });
  }

  revalidatePath("/leads");
  return data;
}

export async function updateAiColumn(id: string, patch: Partial<Pick<AiColumnDefinitionRow, "name" | "description" | "prompt_template" | "output_type">>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_column_definitions").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/leads");
}

export async function deleteAiColumn(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_column_definitions").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/leads");
}

/** Computes one value for one lead, branching on the column's action type. Never throws. */
async function computeAiColumnValue(
  actionType: AiColumnActionType,
  promptTemplate: string,
  lead: Record<string, unknown>
): Promise<{ ok: boolean; value: string }> {
  if (actionType === "anysite_email") {
    const linkedin = lead.linkedin as string | null;
    if (!linkedin) return { ok: false, value: "No LinkedIn URL on this lead" };
    const result = await findEmailByLinkedIn(linkedin);
    return result.ok && result.email ? { ok: true, value: result.email } : { ok: false, value: result.error || "No email found" };
  }
  const prompt = buildAiColumnPrompt(promptTemplate, lead);
  const value = (await aiChat({ prompt, temperature: 0.3, maxTokens: 120 })).trim();
  return { ok: true, value };
}

/** Runs a (not-yet-saved or saved) column config against up to 5 real leads without persisting — used for the "Try on 5 rows" preview. */
export async function previewAiColumn(input: {
  prompt_template: string;
  action_type?: AiColumnActionType;
  leadIds?: string[];
}): Promise<{ ok: boolean; actionType?: AiColumnActionType; results?: { leadId: string; label: string; value: string }[]; error?: string }> {
  const leads = await getLeads();
  const sample = input.leadIds?.length
    ? leads.filter((l) => input.leadIds!.includes(l.id))
    : leads.slice(0, 5);
  if (!sample.length) return { ok: false, error: "No leads to preview against yet." };

  const actionType = input.action_type ?? detectAiColumnActionType(input.prompt_template);

  try {
    const results = await Promise.all(
      sample.slice(0, 5).map(async (lead) => {
        const { value } = await computeAiColumnValue(actionType, input.prompt_template, lead as unknown as Record<string, unknown>);
        return { leadId: lead.id, label: lead.full_name || lead.company_name || lead.email || "Lead", value };
      })
    );
    return { ok: true, actionType, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Preview failed" };
  }
}

/**
 * Runs a saved AI column against leads (all leads if leadIds omitted) and persists
 * the result into each lead's custom_fields[column.id].
 * AI-text columns process sequentially and charge 1 credit/lead (same billing as
 * every other AI action). AnySite email lookups are real network calls that can
 * take tens of seconds each, so they're resolved in small concurrent batches
 * (via findEmailsByLinkedIn) instead of one-by-one — otherwise a 30+ lead run
 * could take many minutes. They aren't AI credit spend, matching the existing
 * "Find email" button, which also doesn't charge credits.
 */
export async function runAiColumn(columnId: string, leadIds?: string[]): Promise<{ ok: boolean; processed: number; failed: number; error?: string }> {
  const supabase = await createClient();
  const { data: column } = await supabase.from("ai_column_definitions").select("*").eq("id", columnId).single();
  if (!column) return { ok: false, processed: 0, failed: 0, error: "Column not found" };

  const leads = await getLeads();
  const targets = leadIds?.length ? leads.filter((l) => leadIds.includes(l.id)) : leads;
  if (!targets.length) return { ok: true, processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  if (column.action_type === "anysite_email") {
    const linkedinUrls = targets.map((l) => l.linkedin).filter((u): u is string => Boolean(u));
    const resolved = await findEmailsByLinkedIn(linkedinUrls);
    for (const lead of targets) {
      try {
        const r = lead.linkedin ? resolved.get(lead.linkedin) : undefined;
        const value = r?.ok && r.email ? r.email : r?.error || "No LinkedIn URL on this lead";
        const nextFields = { ...(lead.custom_fields || {}), [columnId]: { value, updated_at: new Date().toISOString() } };
        const { error } = await supabase.from("leads").update({ custom_fields: nextFields }).eq("id", lead.id);
        if (error) throw error;
        processed++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/leads");
    return { ok: true, processed, failed };
  }

  for (const lead of targets) {
    if (!(await canAfford(1))) {
      return { ok: failed === 0, processed, failed, error: "Ran out of AI credits partway through — upgrade your plan to finish the rest." };
    }
    try {
      const { value } = await computeAiColumnValue(column.action_type, column.prompt_template, lead as unknown as Record<string, unknown>);
      const nextFields = { ...(lead.custom_fields || {}), [columnId]: { value, updated_at: new Date().toISOString() } };
      const { error } = await supabase.from("leads").update({ custom_fields: nextFields }).eq("id", lead.id);
      if (error) throw error;
      await deductCredits("ai_column", 1, { leadId: lead.id, metadata: { column_id: columnId, column_name: column.name } });
      processed++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/leads");
  return { ok: true, processed, failed };
}
