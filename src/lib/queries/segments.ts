"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { leadMatches, isRuleComplete, type EvalRule } from "@/lib/segments";

// Only the columns a rule can match — keeps the membership scan lightweight.
const LEAD_MATCH_FIELDS = "id, industry, interest_area, source, status, lead_score";

export interface SegmentRow {
  id: string;
  segment_name: string;
  description: string | null;
  segment_type: string;
  status: string;
  logic_type: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentRule {
  id: string;
  segment_id: string;
  field: string;
  operator: string;
  value: string | null;
  rule_order: number;
}

export async function getSegments(): Promise<(SegmentRow & { contacts: number })[]> {
  const supabase = await createClient();
  const { data: segments } = await supabase
    .from("segments")
    .select("*")
    .order("created_at", { ascending: false });
  if (!segments) return [];

  // Count members per segment
  const counts = await Promise.all(
    segments.map(async (s) => {
      const { count } = await supabase
        .from("segment_members")
        .select("*", { count: "exact", head: true })
        .eq("segment_id", s.id);
      return count || 0;
    })
  );

  return segments.map((s, i) => ({ ...s, contacts: counts[i] }));
}

export async function getSegmentWithRules(id: string) {
  const supabase = await createClient();
  const { data: segment } = await supabase.from("segments").select("*").eq("id", id).single();
  const { data: rules } = await supabase
    .from("segment_rules")
    .select("*")
    .eq("segment_id", id)
    .order("rule_order");
  return { segment, rules: rules || [] };
}

export async function createSegment(
  name: string,
  description: string,
  type: string,
  rules: Omit<SegmentRule, "id" | "segment_id">[],
  logic: "AND" | "OR" = "AND"
) {
  const supabase = await createClient();
  const { data: segment, error } = await supabase
    .from("segments")
    .insert({ segment_name: name, description, segment_type: type, status: "Active", logic_type: logic })
    .select()
    .single();
  if (error) throw error;

  if (rules.length > 0) {
    await supabase.from("segment_rules").insert(
      rules.map((r) => ({ segment_id: segment.id, ...r }))
    );
  }

  // Evaluate the rules now so the segment actually has members (was previously
  // never populated, leaving every segment empty).
  await materializeSegmentMembers(segment.id);

  revalidatePath("/segments");
  return segment;
}

/**
 * Counts how many leads a draft rule set would match — used by the builder's
 * live preview (replaces the old Math.random() placeholder). Does not persist.
 */
export async function previewSegmentCount(rules: EvalRule[], logic: "AND" | "OR"): Promise<number> {
  if (!rules.filter(isRuleComplete).length) return 0;
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  if (!leads) return 0;
  return leads.filter((l) => leadMatches(l as Record<string, unknown>, rules, logic)).length;
}

/**
 * Recomputes a segment's membership from its stored rules: matches every lead in
 * the workspace and rewrites segment_members. Returns the new member count.
 */
export async function materializeSegmentMembers(segmentId: string): Promise<number> {
  const supabase = await createClient();

  const { data: segment } = await supabase.from("segments").select("logic_type").eq("id", segmentId).single();
  const logic: "AND" | "OR" = segment?.logic_type === "OR" ? "OR" : "AND";

  const { data: rules } = await supabase
    .from("segment_rules")
    .select("field, operator, value")
    .eq("segment_id", segmentId);
  const active = (rules || []).filter((r) => isRuleComplete(r as EvalRule)) as EvalRule[];

  // Always start clean so removed/edited rules don't leave stale members behind.
  await supabase.from("segment_members").delete().eq("segment_id", segmentId);
  if (!active.length) return 0;

  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const matchIds = (leads || [])
    .filter((l) => leadMatches(l as Record<string, unknown>, active, logic))
    .map((l) => (l as { id: string }).id);

  if (matchIds.length) {
    await supabase.from("segment_members").insert(matchIds.map((lead_id) => ({ segment_id: segmentId, lead_id })));
  }
  return matchIds.length;
}

/** Re-evaluates a dynamic segment on demand (the list's Refresh action). */
export async function refreshSegment(segmentId: string): Promise<number> {
  const n = await materializeSegmentMembers(segmentId);
  revalidatePath("/segments");
  return n;
}

export async function deleteSegment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("segments").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/segments");
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function exportSegmentCsv(segmentId: string): Promise<{ filename: string; csv: string }> {
  const supabase = await createClient();
  const { data: segment } = await supabase
    .from("segments")
    .select("segment_name")
    .eq("id", segmentId)
    .single();

  const segmentName = segment?.segment_name || "segment";

  const { data: members } = await supabase
    .from("segment_members")
    .select("leads(full_name, email, company_name, industry, lead_score, status)")
    .eq("segment_id", segmentId);

  const header = ["Name", "Email", "Company", "Industry", "Score", "Status"].join(",");
  const rows = (members || []).map((m) => {
    const lead = (m as { leads?: { full_name?: string; email?: string; company_name?: string; industry?: string; lead_score?: number; status?: string } }).leads;
    return [
      csvEscape(lead?.full_name),
      csvEscape(lead?.email),
      csvEscape(lead?.company_name),
      csvEscape(lead?.industry),
      csvEscape(lead?.lead_score),
      csvEscape(lead?.status),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const filename = segmentName.toLowerCase().replace(/\s+/g, "-") + ".csv";
  return { filename, csv };
}
