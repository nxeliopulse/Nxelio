"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { leadMatchesTree, hasAnyComplete, flatRulesToTree, isSuppressed, validateRuleTree, SEGMENT_FIELDS, type Group, type EvalRule } from "@/lib/segments";
import type { LeadRow } from "@/lib/queries/leads";
import { resolveUniqueName } from "@/lib/queries/name-uniqueness";

// Only the columns a rule can match (see SEGMENT_FIELDS in lib/segments.ts),
// plus the three suppression flags and the fields the sample-prospect preview
// displays — keeps the membership scan lightweight without a second query.
const LEAD_MATCH_FIELDS =
  "id, full_name, job_title, company_name, lead_score, industry, interest_area, source, status, company_size, seniority, country, owner_id, created_at, updated_at, verified, email_opt_out, do_not_contact, email_bounced";

type MatchLead = Record<string, unknown> & {
  id: string;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  lead_score: number;
  email_opt_out: boolean;
  do_not_contact: boolean;
  email_bounced: boolean;
};

export interface SegmentRow {
  id: string;
  segment_name: string;
  description: string | null;
  segment_type: string;
  status: string;
  logic_type: string;
  rule_json: Group | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
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

/** Loads a segment's rule tree — falls back to converting its legacy flat
 *  segment_rules if rule_json is somehow still null (shouldn't happen after
 *  the Phase 1 backfill, but keeps old segments openable either way). */
export async function getSegmentWithRules(id: string): Promise<{ segment: SegmentRow | null; rule: Group | null }> {
  const supabase = await createClient();
  const { data: segment } = await supabase.from("segments").select("*").eq("id", id).single();
  if (!segment) return { segment: null, rule: null };

  let created_by_name: string | null = null;
  if (segment.created_by) {
    const { data: creator } = await supabase.from("users").select("full_name").eq("user_id", segment.created_by).maybeSingle();
    created_by_name = creator?.full_name ?? null;
  }
  const withCreator = { ...segment, created_by_name } as SegmentRow;

  if (segment.rule_json) return { segment: withCreator, rule: segment.rule_json as Group };

  const { data: rules } = await supabase.from("segment_rules").select("field, operator, value, rule_order").eq("segment_id", id).order("rule_order");
  const rule = flatRulesToTree((rules || []) as EvalRule[], segment.logic_type === "OR" ? "OR" : "AND");
  return { segment: withCreator, rule };
}

export type SegmentActionResult = { ok: true; segment: SegmentRow } | { ok: false; error: string };

/** Returns a result instead of throwing for a name collision: this is invoked
 *  directly from client event handlers (not a <form action>), and a thrown
 *  Error there surfaces as a raw HTTP 500 instead of a catchable rejection —
 *  see name-uniqueness.ts. */
export async function createSegment(name: string, description: string, type: string, rule: Group, status: string = "Active"): Promise<SegmentActionResult> {
  const errors = validateRuleTree(rule);
  if (errors.length) throw new Error(errors[0]);

  const supabase = await createClient();
  const nameResult = await resolveUniqueName(supabase, {
    table: "segments",
    column: "segment_name",
    desiredName: name,
    fallbackBase: "Segment",
    label: "segment",
  });
  if (!nameResult.ok) return { ok: false, error: nameResult.error };
  const { data: userData } = await supabase.auth.getUser();
  const { data: segment, error } = await supabase
    .from("segments")
    .insert({ segment_name: nameResult.name, description, segment_type: type, status, rule_json: rule, created_by: userData?.user?.id ?? null })
    .select()
    .single();
  if (error) return { ok: false, error: error.message || "Couldn't create the segment." };

  // Evaluate the rules now so the segment actually has members.
  await materializeSegmentMembers(segment.id);

  revalidatePath("/segments");
  await logAudit({ action: "segment.created", entityType: "segment", entityId: segment.id, entityLabel: segment.segment_name });
  return { ok: true, segment: segment as SegmentRow };
}

/** Updates an existing segment's name/rules and re-evaluates its members.
 *  `status` is optional — omit it to leave the segment's current status
 *  untouched (e.g. an Archived segment being re-materialized shouldn't
 *  silently flip back to Active). */
export async function updateSegment(id: string, name: string, description: string, type: string, rule: Group, status?: string): Promise<SegmentActionResult> {
  const errors = validateRuleTree(rule);
  if (errors.length) throw new Error(errors[0]);

  const supabase = await createClient();
  const nameResult = await resolveUniqueName(supabase, {
    table: "segments",
    column: "segment_name",
    desiredName: name,
    fallbackBase: "Segment",
    excludeId: id,
    label: "segment",
  });
  if (!nameResult.ok) return { ok: false, error: nameResult.error };
  const payload: Record<string, unknown> = { segment_name: nameResult.name, description, segment_type: type, rule_json: rule };
  if (status) payload.status = status;
  const { data: segment, error } = await supabase.from("segments").update(payload).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message || "Couldn't update the segment." };

  await materializeSegmentMembers(id);

  revalidatePath("/segments");
  await logAudit({ action: "segment.updated", entityType: "segment", entityId: id, entityLabel: nameResult.name });
  return { ok: true, segment: segment as SegmentRow };
}

export interface SegmentPreview {
  /** Satisfies the business rules, regardless of contactability. */
  matched: number;
  /** Of the matched leads, how many are unsubscribed / do-not-contact / bounced. */
  suppressed: number;
  /** matched - suppressed — the count that could actually be enrolled in a campaign. */
  eligible: number;
  /** Distinct non-empty company_name among matched leads. */
  companies: number;
  /** Average lead_score among matched leads, 0 when none matched. */
  avgScore: number;
}

/**
 * Evaluates a draft rule tree against real leads — used by the builder's live
 * preview. Does not persist. Distinguishes matched/suppressed/eligible so a
 * segment's true business match count is never silently conflated with who
 * can legally be contacted.
 */
export async function previewSegment(rule: Group): Promise<SegmentPreview> {
  if (!hasAnyComplete(rule)) return { matched: 0, suppressed: 0, eligible: 0, companies: 0, avgScore: 0 };
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const matched = ((leads || []) as MatchLead[]).filter((l) => leadMatchesTree(l, rule));
  const suppressed = matched.filter(isSuppressed).length;
  const companies = new Set(matched.map((l) => l.company_name).filter((v): v is string => Boolean(v))).size;
  const avgScore = matched.length ? Math.round(matched.reduce((sum, l) => sum + (l.lead_score || 0), 0) / matched.length) : 0;
  return { matched: matched.length, suppressed, eligible: matched.length - suppressed, companies, avgScore };
}

/** Five sample matching leads (name/title/company/score/country) for the preview panel. */
export async function getSamplePreviewLeads(rule: Group, limit = 5): Promise<{ id: string; name: string; title: string | null; company: string | null; score: number; country: string | null }[]> {
  if (!hasAnyComplete(rule)) return [];
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  return ((leads || []) as MatchLead[])
    .filter((l) => leadMatchesTree(l, rule) && !isSuppressed(l))
    .slice(0, limit)
    .map((l) => ({ id: l.id, name: l.full_name || l.company_name || "—", title: l.job_title, company: l.company_name, score: l.lead_score, country: (l.country as string | null) ?? null }));
}

/** Real distinct-value breakdown of matched leads (top 4 + "Other"), as
 *  percentages of the matched set — used by the Audience Insights panel.
 *  Empty arrays when nothing matches, rather than a fabricated distribution. */
export async function getSegmentBreakdown(rule: Group): Promise<{ industries: { name: string; value: number }[]; countries: { name: string; value: number }[] }> {
  if (!hasAnyComplete(rule)) return { industries: [], countries: [] };
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const matched = ((leads || []) as MatchLead[]).filter((l) => leadMatchesTree(l, rule));
  const total = matched.length;
  if (!total) return { industries: [], countries: [] };

  const bucket = (key: "industry" | "country") => {
    const counts = new Map<string, number>();
    for (const l of matched) {
      const v = (l[key] as string | null) || "Unknown";
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4).map(([n, c]) => ({ name: n, value: Math.round((c / total) * 100) }));
    const restCount = sorted.slice(4).reduce((sum, [, c]) => sum + c, 0);
    if (restCount > 0) top.push({ name: "Other", value: Math.round((restCount / total) * 100) });
    return top;
  };
  return { industries: bucket("industry"), countries: bucket("country") };
}

/** Real cumulative count of matched leads by their actual created_at date,
 *  bucketed over the last N days — used by the Audience Trend chart. There is
 *  no historical membership snapshot table, so this shows real lead-creation
 *  growth within the matched set rather than fabricating a moment-in-time series. */
export async function getSegmentTrend(rule: Group, days: number = 30): Promise<{ date: string; count: number }[]> {
  if (!hasAnyComplete(rule)) return [];
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const matched = ((leads || []) as MatchLead[]).filter((l) => leadMatchesTree(l, rule));
  const matchedDates = matched.map((l) => new Date(l.created_at as string).getTime()).filter((t) => !Number.isNaN(t));

  const now = new Date();
  const buckets: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(23, 59, 59, 999);
    buckets.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: matchedDates.filter((t) => t <= day.getTime()).length,
    });
  }
  return buckets;
}

/** Real progressive funnel: total leads → after applying each successive
 *  top-level rule condition → final matched count. Only meaningful for an
 *  "ALL" (AND) root group — narrowing step-by-step doesn't map cleanly onto
 *  ANY/NOT semantics, so those just show total → final. */
export async function getSegmentFunnel(rule: Group): Promise<{ label: string; value: number }[]> {
  const supabase = await createClient();
  const { count: totalCount } = await supabase.from("leads").select("id", { count: "exact", head: true });
  const total = totalCount || 0;

  if (!hasAnyComplete(rule) || rule.operator !== "ALL") {
    const final = hasAnyComplete(rule) ? (await previewSegment(rule)).matched : 0;
    return [{ label: "Total Prospects", value: total }, { label: "Final Segment", value: final }];
  }

  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const allLeads = (leads || []) as MatchLead[];
  const steps: { label: string; value: number }[] = [{ label: "Total Prospects", value: total }];

  const completeChildren = rule.children.filter(hasAnyComplete);
  for (let i = 0; i < completeChildren.length; i++) {
    const partial: Group = { type: "group", operator: "ALL", children: completeChildren.slice(0, i + 1) };
    const count = allLeads.filter((l) => leadMatchesTree(l, partial)).length;
    const child = completeChildren[i];
    const stepLabel = child.type === "condition"
      ? `After ${SEGMENT_FIELDS.find((f) => f.key === child.field)?.label || child.field}`
      : `After Group ${i + 1}`;
    steps.push({ label: i === completeChildren.length - 1 ? "Final Segment" : stepLabel, value: count });
  }
  if (steps.length === 1) steps.push({ label: "Final Segment", value: 0 });
  return steps;
}

export interface SegmentPreviewBundle {
  preview: SegmentPreview;
  samples: { id: string; name: string; title: string | null; company: string | null; score: number; country: string | null }[];
  breakdown: { industries: { name: string; value: number }[]; countries: { name: string; value: number }[] };
  trend: { date: string; count: number }[];
  funnel: { label: string; value: number }[];
  /** Per-child running match count, in the SAME order as rule.children (only
   *  meaningful for an "ALL" root — see getSegmentFunnel's doc comment). */
  stepCounts: number[];
}

/**
 * Everything the segment builder's live preview shows, computed from a
 * SINGLE fetch of the leads table instead of the 5-6 independent full-table
 * fetch-and-filter passes previewSegment/getSamplePreviewLeads/
 * getSegmentBreakdown/getSegmentTrend/getSegmentFunnel/stepCounts used to run
 * in parallel on every keystroke — that redundancy (not a missing index;
 * there's no WHERE clause to index against a dynamic rule tree) is what made
 * opening a segment feel slow as the leads table grew. Same math as those
 * functions, just evaluated once over one in-memory array.
 */
export async function getSegmentPreviewBundle(rule: Group, days: number = 30): Promise<SegmentPreviewBundle> {
  const empty: SegmentPreviewBundle = {
    preview: { matched: 0, suppressed: 0, eligible: 0, companies: 0, avgScore: 0 },
    samples: [], breakdown: { industries: [], countries: [] }, trend: [], funnel: [], stepCounts: rule.children.map(() => 0),
  };
  if (!hasAnyComplete(rule)) return empty;

  const supabase = await createClient();
  const [{ data: leads }, { count: totalCount }] = await Promise.all([
    supabase.from("leads").select(LEAD_MATCH_FIELDS),
    supabase.from("leads").select("id", { count: "exact", head: true }),
  ]);
  const allLeads = (leads || []) as MatchLead[];
  const total = totalCount || 0;

  const matched = allLeads.filter((l) => leadMatchesTree(l, rule));
  const suppressedCount = matched.filter(isSuppressed).length;
  const companies = new Set(matched.map((l) => l.company_name).filter((v): v is string => Boolean(v))).size;
  const avgScore = matched.length ? Math.round(matched.reduce((sum, l) => sum + (l.lead_score || 0), 0) / matched.length) : 0;
  const preview: SegmentPreview = { matched: matched.length, suppressed: suppressedCount, eligible: matched.length - suppressedCount, companies, avgScore };

  const samples = matched
    .filter((l) => !isSuppressed(l))
    .slice(0, 5)
    .map((l) => ({ id: l.id, name: l.full_name || l.company_name || "—", title: l.job_title, company: l.company_name, score: l.lead_score, country: (l.country as string | null) ?? null }));

  let breakdown: SegmentPreviewBundle["breakdown"] = { industries: [], countries: [] };
  if (matched.length) {
    const bucket = (key: "industry" | "country") => {
      const counts = new Map<string, number>();
      for (const l of matched) {
        const v = (l[key] as string | null) || "Unknown";
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, 4).map(([n, c]) => ({ name: n, value: Math.round((c / matched.length) * 100) }));
      const restCount = sorted.slice(4).reduce((sum, [, c]) => sum + c, 0);
      if (restCount > 0) top.push({ name: "Other", value: Math.round((restCount / matched.length) * 100) });
      return top;
    };
    breakdown = { industries: bucket("industry"), countries: bucket("country") };
  }

  const matchedDates = matched.map((l) => new Date(l.created_at as string).getTime()).filter((t) => !Number.isNaN(t));
  const now = new Date();
  const trend: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(23, 59, 59, 999);
    trend.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: matchedDates.filter((t) => t <= day.getTime()).length,
    });
  }

  let funnel: { label: string; value: number }[];
  let stepCounts: number[];
  if (rule.operator !== "ALL") {
    funnel = [{ label: "Total Prospects", value: total }, { label: "Final Segment", value: matched.length }];
    stepCounts = rule.children.map(() => matched.length);
  } else {
    funnel = [{ label: "Total Prospects", value: total }];
    const completeChildren = rule.children.filter(hasAnyComplete);
    const steps: number[] = [];
    for (let i = 0; i < completeChildren.length; i++) {
      const partial: Group = { type: "group", operator: "ALL", children: completeChildren.slice(0, i + 1) };
      const count = allLeads.filter((l) => leadMatchesTree(l, partial)).length;
      steps.push(count);
      const child = completeChildren[i];
      const stepLabel = child.type === "condition"
        ? `After ${SEGMENT_FIELDS.find((f) => f.key === child.field)?.label || child.field}`
        : `After Group ${i + 1}`;
      funnel.push({ label: i === completeChildren.length - 1 ? "Final Segment" : stepLabel, value: count });
    }
    if (funnel.length === 1) funnel.push({ label: "Final Segment", value: 0 });
    // Map step results back onto rule.children's original indices/order —
    // completeChildren may be a filtered subset if some children are incomplete.
    stepCounts = rule.children.map((c) => {
      const idx = completeChildren.indexOf(c);
      return idx === -1 ? 0 : steps[idx];
    });
  }

  return { preview, samples, breakdown, trend, funnel, stepCounts };
}

/**
 * Creates a "Static" segment from an explicit, manually-picked set of leads
 * (e.g. the leads table's bulk "Create segment" action) — no rules, membership
 * never changes on its own. Kept separate from createSegment() because a
 * Static segment must never be re-evaluated by materializeSegmentMembers()
 * (see the segment_type guard there), which would otherwise wipe this exact
 * hand-picked list back down to whatever a (nonexistent) rule set matches.
 */
/** `autoUnique` — when true, a name collision is silently resolved with a
 *  "(n)" suffix instead of being rejected; use this for names the caller
 *  generated on the user's behalf (e.g. "Campaign audience (12 leads)")
 *  rather than ones the user typed themselves. */
export async function createStaticSegment(name: string, description: string, leadIds: string[], opts?: { autoUnique?: boolean }): Promise<SegmentActionResult> {
  const supabase = await createClient();
  const nameResult = await resolveUniqueName(supabase, {
    table: "segments",
    column: "segment_name",
    desiredName: name,
    fallbackBase: "Segment",
    label: "segment",
    autoUnique: opts?.autoUnique,
  });
  if (!nameResult.ok) return { ok: false, error: nameResult.error };
  const { data: segment, error } = await supabase
    .from("segments")
    .insert({ segment_name: nameResult.name, description, segment_type: "Static", status: "Active" })
    .select()
    .single();
  if (error) return { ok: false, error: error.message || "Couldn't create the segment." };

  if (leadIds.length > 0) {
    const { error: memberErr } = await supabase
      .from("segment_members")
      .insert(leadIds.map((lead_id) => ({ segment_id: segment.id, lead_id })));
    if (memberErr) return { ok: false, error: memberErr.message || "Couldn't add leads to the segment." };
  }

  revalidatePath("/segments");
  revalidatePath("/leads");
  await logAudit({ action: "segment.created", entityType: "segment", entityId: segment.id, entityLabel: segment.segment_name, metadata: { type: "Static", count: leadIds.length } });
  return { ok: true, segment: segment as SegmentRow };
}

/**
 * Recomputes a segment's membership from its stored rule tree: matches every
 * lead in the workspace and rewrites segment_members. Returns the new member
 * count. No-ops for "Static" segments (see createStaticSegment) — their
 * membership is a manually-picked list, not something a rule set should ever
 * recompute. Membership reflects "Matched", independent of suppression —
 * suppression is applied downstream at preview/send time, matching the doc's
 * distinction between Matched, Suppressed, and Eligible.
 */
export async function materializeSegmentMembers(segmentId: string): Promise<number> {
  const supabase = await createClient();

  const { data: segment } = await supabase.from("segments").select("rule_json, segment_type").eq("id", segmentId).single();
  if (segment?.segment_type === "Static") {
    const { count } = await supabase.from("segment_members").select("*", { count: "exact", head: true }).eq("segment_id", segmentId);
    return count || 0;
  }
  const rule = segment?.rule_json as Group | null;

  // Always start clean so removed/edited rules don't leave stale members behind.
  await supabase.from("segment_members").delete().eq("segment_id", segmentId);
  if (!rule || !hasAnyComplete(rule)) return 0;

  const { data: leads } = await supabase.from("leads").select(LEAD_MATCH_FIELDS);
  const matchIds = ((leads || []) as MatchLead[])
    .filter((l) => leadMatchesTree(l, rule))
    .map((l) => l.id);

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
  await logAudit({ action: "segment.deleted", entityType: "segment", entityId: id });
}

/** Clones a segment's rule tree (and, for a Static segment, its exact
 *  member list) into a new "<name> (Copy)" segment — never shares state with
 *  the original afterward, so editing the copy can't affect it. */
export async function duplicateSegment(id: string): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: original } = await supabase.from("segments").select("*").eq("id", id).single();
  if (!original) throw new Error("Segment not found");

  const { data: copy, error } = await supabase
    .from("segments")
    .insert({
      segment_name: `${original.segment_name} (Copy)`,
      description: original.description,
      segment_type: original.segment_type,
      status: "Active",
      rule_json: original.rule_json,
    })
    .select()
    .single();
  if (error) throw error;

  if (original.segment_type === "Static") {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", id);
    if (members?.length) {
      await supabase.from("segment_members").insert(members.map((m) => ({ segment_id: copy.id, lead_id: m.lead_id })));
    }
  } else {
    await materializeSegmentMembers(copy.id);
  }

  revalidatePath("/segments");
  await logAudit({ action: "segment.duplicated", entityType: "segment", entityId: copy.id, entityLabel: copy.segment_name, metadata: { duplicatedFrom: id } });
  return { id: copy.id };
}

/** Archives a segment — hidden from the active list, membership stops being
 *  recalculated, but nothing is deleted (Restore brings it back as-is). */
export async function archiveSegment(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("segments").update({ status: "Archived" }).eq("id", id);
  if (error) throw error;
  revalidatePath("/segments");
  await logAudit({ action: "segment.archived", entityType: "segment", entityId: id });
}

export async function restoreSegment(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("segments").update({ status: "Active" }).eq("id", id);
  if (error) throw error;
  revalidatePath("/segments");
  await logAudit({ action: "segment.restored", entityType: "segment", entityId: id });
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Full lead records for a segment's members — for previewing/reviewing who's actually in it. */
export async function getSegmentMemberLeads(segmentId: string): Promise<LeadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("segment_members")
    .select("leads(*)")
    .eq("segment_id", segmentId);
  return ((data ?? []) as unknown as { leads: LeadRow | null }[])
    .map((m) => m.leads)
    .filter((l): l is LeadRow => l !== null);
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
