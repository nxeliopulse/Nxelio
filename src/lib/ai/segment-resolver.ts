// Metadata Resolution Layer for the AI Builder — the DB-backed half. Pure
// value-matching logic (exact/synonym/fuzzy, explanation text) lives in
// segment-value-matching.ts so it can be unit tested without a DB; this file
// wraps that with the actual lookups (real picklist/distinct/owner values)
// and walks an LLM-proposed rule tree, replacing or dropping every value.
//
// Not a "use server" module itself (it exports plain sync helpers alongside
// async ones, which "use server" files can't do) — it only ever runs from
// inside actions.ts's own server action, never imported directly by a client
// component.
import { getPicklistValues } from "@/lib/queries/picklists";
import { getDistinctLeadValues } from "@/lib/queries/leads";
import { getUsers } from "@/lib/queries/users";
import { SEGMENT_FIELDS, operatorsForField, type Condition, type Group, type RuleNode } from "@/lib/segments";
import { resolveAgainstVocabulary, type MatchKind } from "@/lib/ai/segment-value-matching";

export { resolveAgainstVocabulary, explainRuleTree, SEGMENT_VALUE_SYNONYMS, type MatchKind, type ValueResolution } from "@/lib/ai/segment-value-matching";

/** This workspace's real vocabulary for one field — the union of the admin-
 *  curated picklist (if any) and whatever values already exist on real
 *  leads, since the two can drift apart (a picklist can be missing values
 *  that free-text/imported data already uses) and both are equally "real". */
export async function getFieldVocabulary(fieldKey: string): Promise<string[]> {
  const field = SEGMENT_FIELDS.find((f) => f.key === fieldKey);
  if (!field?.options) return [];
  const values = new Set<string>();
  if (field.options.kind === "picklist") {
    for (const v of await getPicklistValues(field.options.key).catch(() => [])) values.add(v);
    // Widened distinct-value lookup only covers picklist-shaped lead columns.
    if (["industry", "interest_area", "status", "company_size", "seniority"].includes(fieldKey)) {
      for (const v of await getDistinctLeadValues(fieldKey as "industry" | "interest_area" | "status" | "company_size" | "seniority").catch(() => [])) values.add(v);
    }
  } else if (field.options.kind === "distinct") {
    for (const v of await getDistinctLeadValues(fieldKey as "source" | "country").catch(() => [])) values.add(v);
  } else if (field.options.kind === "owner") {
    for (const u of await getUsers().catch(() => [])) values.add(u.full_name);
  }
  return [...values];
}

export interface UnmappedItem {
  requested: string;
  field?: string;
  reason: string;
}

export interface FieldMapping {
  field: string;
  fieldLabel: string;
  operator: string;
  matchKind: MatchKind;
  displayValue: string;
}

export interface ResolvedRuleResult {
  rule: Group;
  mappings: FieldMapping[];
  unmapped: UnmappedItem[];
}

/**
 * Walks the LLM's proposed tree and resolves every condition's value against
 * this workspace's real vocabulary. A condition whose value can't be
 * resolved is dropped from the rule entirely (never left in with a guessed
 * value) and reported in `unmapped` with a reason instead.
 */
export async function resolveRuleTree(root: Group): Promise<ResolvedRuleResult> {
  const mappings: FieldMapping[] = [];
  const unmapped: UnmappedItem[] = [];

  async function resolveNode(node: RuleNode): Promise<RuleNode | null> {
    if (node.type === "group") {
      const children = (await Promise.all(node.children.map(resolveNode))).filter((c): c is RuleNode => c !== null);
      if (!children.length) return null;
      return { type: "group", operator: node.operator, children };
    }
    return resolveCondition(node);
  }

  async function resolveCondition(c: Condition): Promise<Condition | null> {
    const field = SEGMENT_FIELDS.find((f) => f.key === c.field);
    if (!field) {
      unmapped.push({ requested: c.value ?? c.field, reason: `"${c.field}" is not a field this workspace has.` });
      return null;
    }
    if (!operatorsForField(c.field).some((o) => o.key === c.operator)) {
      unmapped.push({ field: field.label, requested: c.value ?? "", reason: `"${c.operator}" isn't a valid way to filter ${field.label}.` });
      return null;
    }

    // Booleans, numbers, dates, and free-text fields (no fixed vocabulary)
    // pass through as-is — resolution only applies where a fixed vocabulary
    // exists to check against (the exact failure mode this layer targets).
    if (!field.options || field.type !== "text" || c.operator === "between" || c.operator === "is_true" || c.operator === "is_false") {
      mappings.push({ field: c.field, fieldLabel: field.label, operator: c.operator, matchKind: "exact", displayValue: c.value ?? "" });
      return c;
    }

    const vocabulary = await getFieldVocabulary(c.field);
    const resolved = resolveAgainstVocabulary(c.value ?? "", vocabulary);
    if (resolved.status === "unmapped") {
      unmapped.push({ field: field.label, requested: resolved.requested, reason: resolved.reason || `Couldn't verify "${resolved.requested}" for ${field.label}.` });
      return null;
    }
    mappings.push({ field: c.field, fieldLabel: field.label, operator: c.operator, matchKind: resolved.status, displayValue: resolved.value! });
    return { ...c, value: resolved.value };
  }

  const resolved = await resolveNode(root);
  const rule: Group = resolved?.type === "group" ? resolved : { type: "group", operator: "ALL", children: resolved ? [resolved] : [] };
  return { rule, mappings, unmapped };
}
