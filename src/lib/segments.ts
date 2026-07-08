// Shared (client + server) segment rule model + evaluator. No "use server" here
// so the builder can import the field/operator catalogs and types directly.

export type FieldType = "text" | "number";

/** The only lead fields a segment rule can match — each maps to a real column. */
export const SEGMENT_FIELDS: { key: string; label: string; type: FieldType; hint?: string }[] = [
  { key: "industry", label: "Industry", type: "text", hint: "e.g. Technology" },
  { key: "interest_area", label: "Interest Area", type: "text", hint: "e.g. CRM" },
  { key: "source", label: "Source", type: "text", hint: "e.g. LinkedIn" },
  { key: "status", label: "Status", type: "text", hint: "New / Warm / Hot / Converted" },
  { key: "lead_score", label: "Lead Score", type: "number", hint: "0–100" },
];

export const TEXT_OPERATORS = [
  { key: "equals", label: "equals" },
  { key: "not_equals", label: "not equals" },
  { key: "contains", label: "contains" },
];

export const NUMBER_OPERATORS = [
  { key: "equals", label: "equals" },
  { key: "gt", label: "greater than" },
  { key: "lt", label: "less than" },
];

export function fieldType(fieldKey: string): FieldType {
  return SEGMENT_FIELDS.find((f) => f.key === fieldKey)?.type ?? "text";
}

export function operatorsForField(fieldKey: string) {
  return fieldType(fieldKey) === "number" ? NUMBER_OPERATORS : TEXT_OPERATORS;
}

export interface EvalRule {
  field: string;
  operator: string;
  value: string | null;
}

/** A rule only counts once it has a field, an operator, and a non-empty value. */
export function isRuleComplete(r: EvalRule): boolean {
  return Boolean(r.field && r.operator && r.value != null && String(r.value).trim() !== "");
}

function matchOne(lead: Record<string, unknown>, rule: EvalRule): boolean {
  const raw = lead[rule.field];
  const target = String(rule.value ?? "").trim();
  // Normalize operator aliases so rules from the builder (gt/lt), the AI
  // assistant (greater_than/less_than) and legacy data ("greater than") all work.
  const op = rule.operator;
  if (op === "gt" || op === "greater_than" || op === "greater than") return raw != null && Number(raw) > Number(target);
  if (op === "lt" || op === "less_than" || op === "less than") return raw != null && Number(raw) < Number(target);
  switch (op) {
    case "equals":
      return String(raw ?? "").toLowerCase() === target.toLowerCase();
    case "not_equals":
    case "not equals":
      return String(raw ?? "").toLowerCase() !== target.toLowerCase();
    case "contains":
      return String(raw ?? "").toLowerCase().includes(target.toLowerCase());
    default:
      return false;
  }
}

/** True if a lead satisfies the rule set under AND/OR logic. Incomplete rules are
 *  ignored; a rule set with no complete rules matches nobody (not everybody). */
export function leadMatches(lead: Record<string, unknown>, rules: EvalRule[], logic: "AND" | "OR"): boolean {
  const active = rules.filter(isRuleComplete);
  if (active.length === 0) return false;
  return logic === "OR"
    ? active.some((r) => matchOne(lead, r))
    : active.every((r) => matchOne(lead, r));
}
