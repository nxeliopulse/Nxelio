// Shared (client + server) segment rule model + evaluator. No "use server" here
// so the builder can import the field/operator catalogs and types directly.

export type FieldType = "text" | "number" | "date" | "boolean";

/**
 * Where a rule's value dropdown gets its options from, when the field has a
 * known/fixed vocabulary — so the value input can be a real `<select>`
 * instead of free text. Fields with no fixed vocabulary (Company, Job Title)
 * are left without one and stay free text.
 * - "picklist": sourced from the admin-managed Picklist Manager (Administration → Picklists).
 * - "distinct": sourced live from whatever values already exist on real leads for that column.
 * - "owner": sourced from the workspace's user list.
 */
export type OptionsSource =
  | { kind: "picklist"; key: import("./picklists").PicklistKey }
  | { kind: "distinct" }
  | { kind: "owner" };

/** The lead fields a segment rule can match — each maps to a real column. */
export const SEGMENT_FIELDS: { key: string; label: string; type: FieldType; hint?: string; options?: OptionsSource }[] = [
  { key: "industry", label: "Industry", type: "text", options: { kind: "picklist", key: "lead_industry" } },
  { key: "interest_area", label: "Interest Area", type: "text", options: { kind: "picklist", key: "lead_interest_area" } },
  { key: "status", label: "Status", type: "text", options: { kind: "picklist", key: "lead_status" } },
  { key: "company_size", label: "Company Size", type: "text", options: { kind: "picklist", key: "lead_company_size" } },
  { key: "seniority", label: "Seniority", type: "text", options: { kind: "picklist", key: "lead_seniority" } },
  { key: "source", label: "Source", type: "text", options: { kind: "distinct" } },
  { key: "country", label: "Country", type: "text", options: { kind: "distinct" } },
  { key: "owner_id", label: "Owner", type: "text", options: { kind: "owner" } },
  { key: "company_name", label: "Company", type: "text", hint: "e.g. Acme Inc" },
  { key: "job_title", label: "Job Title", type: "text", hint: "e.g. Head of Sales" },
  { key: "lead_score", label: "Lead Score", type: "number", hint: "0–100" },
  { key: "created_at", label: "Created Date", type: "date" },
  { key: "updated_at", label: "Last Activity", type: "date" },
  { key: "verified", label: "Verified", type: "boolean" },
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
  { key: "between", label: "between" },
];

export const DATE_OPERATORS = [
  { key: "before", label: "before" },
  { key: "after", label: "after" },
  { key: "between", label: "between" },
  { key: "in_last_days", label: "in the last (days)" },
];

export const BOOLEAN_OPERATORS = [
  { key: "is_true", label: "is true" },
  { key: "is_false", label: "is false" },
];

export function fieldType(fieldKey: string): FieldType {
  return SEGMENT_FIELDS.find((f) => f.key === fieldKey)?.type ?? "text";
}

export function operatorsForField(fieldKey: string) {
  const t = fieldType(fieldKey);
  if (t === "number") return NUMBER_OPERATORS;
  if (t === "date") return DATE_OPERATORS;
  if (t === "boolean") return BOOLEAN_OPERATORS;
  return TEXT_OPERATORS;
}

/** "between" (number) and date conditions need two pieces of data in one
 *  string value — encoded as "a|b" so Condition.value can stay a plain string
 *  rather than forcing every consumer to branch on a value shape. */
export function encodeRange(a: string, b: string): string {
  return `${a}|${b}`;
}
export function decodeRange(value: string | null): [string, string] {
  const [a = "", b = ""] = (value ?? "").split("|");
  return [a, b];
}

// ---------------------------------------------------------------------------
// Rule tree — ALL / ANY / NOT groups, arbitrarily nested. This is the one
// shared model every builder mode (Rule / AI / Visual) reads and writes;
// there is no separate flat representation anymore.
// ---------------------------------------------------------------------------

export interface Condition {
  type: "condition";
  field: string;
  operator: string;
  value: string | null;
  disabled?: boolean;
}

export type GroupOperator = "ALL" | "ANY" | "NOT";

export interface Group {
  type: "group";
  operator: GroupOperator;
  children: RuleNode[];
  disabled?: boolean;
}

export type RuleNode = Condition | Group;

export function newCondition(field = "industry", operator = "equals", value: string | null = ""): Condition {
  return { type: "condition", field, operator, value, disabled: false };
}

export function newGroup(operator: GroupOperator = "ALL", children: RuleNode[] = []): Group {
  return { type: "group", operator, children, disabled: false };
}

/** A condition only counts once it has a field and an operator, plus a
 *  non-empty value — except boolean operators ("is true"/"is false"), which
 *  are self-contained and need no separate value. "between" needs both sides
 *  of the range filled in, not just a non-empty string. */
export function isConditionComplete(c: Condition): boolean {
  if (c.disabled) return false;
  if (!c.field || !c.operator) return false;
  if (c.operator === "is_true" || c.operator === "is_false") return true;
  if (c.value == null || String(c.value).trim() === "") return false;
  if (c.operator === "between") {
    const [a, b] = decodeRange(c.value);
    return a.trim() !== "" && b.trim() !== "";
  }
  return true;
}

/** True if this node (or anything nested inside it) has at least one complete condition. */
export function hasAnyComplete(node: RuleNode): boolean {
  if (node.disabled) return false;
  return node.type === "condition" ? isConditionComplete(node) : node.children.some(hasAnyComplete);
}

function matchCondition(lead: Record<string, unknown>, rule: Condition): boolean {
  const raw = lead[rule.field];
  const target = String(rule.value ?? "").trim();
  const op = rule.operator;

  if (op === "is_true") return raw === true;
  if (op === "is_false") return raw !== true;

  if (op === "between") {
    if (raw == null) return false;
    const [a, b] = decodeRange(rule.value);
    if (fieldType(rule.field) === "date") {
      const d = new Date(String(raw)).getTime();
      return d >= new Date(a).getTime() && d <= new Date(b).getTime();
    }
    const n = Number(raw);
    return n >= Number(a) && n <= Number(b);
  }
  if (op === "before") return raw != null && new Date(String(raw)).getTime() < new Date(target).getTime();
  if (op === "after") return raw != null && new Date(String(raw)).getTime() > new Date(target).getTime();
  if (op === "in_last_days") {
    if (raw == null) return false;
    const days = Number(target);
    const cutoff = Date.now() - days * 86_400_000;
    return new Date(String(raw)).getTime() >= cutoff;
  }

  // Normalize operator aliases so rules from the builder (gt/lt), the AI
  // assistant (greater_than/less_than) and legacy data ("greater than") all work.
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

/**
 * Evaluates one node against a lead. Incomplete or disabled conditions are skipped.
 * - ALL: every complete active child must match.
 * - ANY: at least one complete active child must match (vacuously true if none are complete yet).
 * - NOT: the group's records are excluded — true (i.e. "not excluded") only when
 *   none of its complete active children match.
 */
function evalNode(lead: Record<string, unknown>, node: RuleNode): boolean {
  if (node.disabled) return true;
  if (node.type === "condition") {
    if (!isConditionComplete(node)) return true;
    return matchCondition(lead, node);
  }
  const active = node.children.filter((c) => !c.disabled && hasAnyComplete(c));
  if (node.operator === "ALL") return active.every((c) => evalNode(lead, c));
  if (node.operator === "ANY") return active.length === 0 ? true : active.some((c) => evalNode(lead, c));
  // NOT
  return !active.some((c) => evalNode(lead, c));
}

/** True if a lead satisfies the rule tree. A tree with no complete conditions
 *  anywhere matches nobody (not everybody) — mirrors the old flat-list behavior. */
export function leadMatchesTree(lead: Record<string, unknown>, root: Group): boolean {
  if (!hasAnyComplete(root)) return false;
  return evalNode(lead, root);
}

const VALID_FIELD_KEYS = new Set(SEGMENT_FIELDS.map((f) => f.key));

/**
 * Structural validation, independent of whether a condition happens to be
 * "complete" — the builder UI only ever offers valid field/operator options,
 * but rule_json is stored as plain JSON, so a direct API call or a bad edit
 * could otherwise save something the evaluator would silently no-op on
 * instead of rejecting outright.
 */
export function validateRuleTree(root: Group, depth = 0): string[] {
  const errors: string[] = [];
  if (root.children.length === 0) {
    errors.push(depth === 0 ? "The rule tree has no conditions." : `A nested ${root.operator} group has no conditions.`);
  }
  for (const child of root.children) {
    if (child.type === "group") {
      errors.push(...validateRuleTree(child, depth + 1));
      continue;
    }
    if (!child.field && !child.operator && (child.value == null || child.value === "")) continue; // untouched blank row — not yet an error
    if (!VALID_FIELD_KEYS.has(child.field)) {
      errors.push(`"${child.field}" is not a valid field.`);
      continue;
    }
    const validOps = operatorsForField(child.field).map((o) => o.key);
    if (!validOps.includes(child.operator)) {
      errors.push(`"${child.operator}" is not a valid operator for field "${child.field}".`);
    }
  }
  if (depth === 0 && root.children.length > 0 && !hasAnyComplete(root)) {
    errors.push("Add at least one complete condition (field, operator and value).");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Legacy flat rule list — kept only to read pre-Phase-1 segments that haven't
// been resaved yet (their rule_json was backfilled from this shape once; new
// saves always go through the tree above). Do not build new UI against this.
// ---------------------------------------------------------------------------

export interface EvalRule {
  field: string;
  operator: string;
  value: string | null;
}

export function isRuleComplete(r: EvalRule): boolean {
  return Boolean(r.field && r.operator && r.value != null && String(r.value).trim() !== "");
}

/** Converts the old flat rules + global AND/OR into an equivalent single-level tree. */
export function flatRulesToTree(rules: EvalRule[], logic: "AND" | "OR"): Group {
  return newGroup(logic === "OR" ? "ANY" : "ALL", rules.map((r) => newCondition(r.field, r.operator, r.value)));
}

/**
 * A lead that matches a segment's business rules but must never actually be
 * contacted — unsubscribed, marked do-not-contact, or a bounced email. Kept as
 * its own check (not folded into the rule tree) so every consumer — segment
 * preview, campaign sending — enforces the same compliance logic the same way.
 */
export function isSuppressed(lead: { email_opt_out?: boolean | null; do_not_contact?: boolean | null; email_bounced?: boolean | null }): boolean {
  return Boolean(lead.email_opt_out || lead.do_not_contact || lead.email_bounced);
}
