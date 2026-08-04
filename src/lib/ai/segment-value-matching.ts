// Pure value-matching logic for the AI Builder's metadata resolution layer —
// deliberately has NO imports beyond @/lib/segments types, so it can be unit
// tested directly (see scripts/test-ai-builder-resolver.mjs) without pulling
// in any server-only/DB code. src/lib/ai/segment-resolver.ts wraps this with
// the actual DB lookups (real vocabulary, real rule-tree walking).
import { SEGMENT_FIELDS, decodeRange, type RuleNode } from "@/lib/segments";

// ---------------------------------------------------------------------------
// Synonym dictionary — checked before reporting a value as unmapped. Purely
// a list of *candidate* substitutions; a synonym still has to match a real
// workspace value afterward, so a stale/wrong entry here can never cause a
// value to be invented — it can only ever fail closed to "unmapped".
// Configurable later (e.g. move to a DB table an admin edits) without
// changing any call site — this is the only place that needs to change.
// ---------------------------------------------------------------------------
export const SEGMENT_VALUE_SYNONYMS: Record<string, string> = {
  "tech": "Technology",
  "msp": "Managed Services",
  "msps": "Managed Services",
  "artificial intelligence": "AI",
  "ceo": "C-Level",
  "cfo": "C-Level",
  "coo": "C-Level",
  "cto": "C-Level",
  "chief executive officer": "C-Level",
  "vp": "VP",
  "vp sales": "VP",
  "vice president": "VP",
  "vice president sales": "VP",
  "director": "Director",
  "marketing": "Marketing Department",
  "sales": "Sales",
  "it": "IT Services",
  "it services": "IT Services",
};

export type MatchKind = "exact" | "synonym" | "fuzzy";

export interface ValueResolution {
  status: MatchKind | "unmapped";
  /** The canonical, real workspace value to actually use — null when unmapped. */
  value: string | null;
  /** What the caller originally asked for, for display ("Tech" -> "Technology"). */
  requested: string;
  reason?: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Cheap edit-distance ratio — good enough to catch typos/minor variants
 *  without a dependency; deliberately conservative (see FUZZY_MAX_RATIO). */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// High-confidence only, per the doc's algorithm — fuzzy match is a safety
// net for typos/minor variants, never a substitute for a genuinely different
// value. 0.2 means at most ~1 edit per 5 characters.
const FUZZY_MAX_RATIO = 0.2;

/** Exact match → synonym match → containment/fuzzy match (high confidence
 *  only) → otherwise unmapped. Never silently substitutes a different real
 *  value for what was asked. */
export function resolveAgainstVocabulary(requested: string, vocabulary: string[]): ValueResolution {
  const reqNorm = normalize(requested);

  const exact = vocabulary.find((v) => normalize(v) === reqNorm);
  if (exact) return { status: "exact", value: exact, requested };

  const synonymTarget = SEGMENT_VALUE_SYNONYMS[reqNorm];
  if (synonymTarget) {
    const synNorm = normalize(synonymTarget);
    // Exact match on the synonym's target first; falling back to containment
    // covers cases like "MSP" -> "Managed Services" matching the real value
    // "Managed Services (MSP)", which isn't an exact string match either.
    const synMatch = vocabulary.find((v) => normalize(v) === synNorm)
      ?? vocabulary.find((v) => normalize(v).includes(synNorm) || synNorm.includes(normalize(v)));
    if (synMatch) return { status: "synonym", value: synMatch, requested };
  }

  // A real value can legitimately be a longer official name containing the
  // shorter phrase someone typed ("IT Services" -> "IT Services and IT
  // Consulting") — a same-length edit-distance ratio unfairly penalizes this,
  // so containment is checked as its own step, still only ever picking a
  // value that's actually on file, never inventing one.
  if (reqNorm.length >= 4) {
    const contains = vocabulary.find((v) => {
      const vNorm = normalize(v);
      return vNorm.includes(reqNorm) || reqNorm.includes(vNorm);
    });
    if (contains) return { status: "fuzzy", value: contains, requested };
  }

  let best: { v: string; ratio: number } | null = null;
  for (const v of vocabulary) {
    const vNorm = normalize(v);
    const dist = levenshtein(reqNorm, vNorm);
    const ratio = dist / Math.max(reqNorm.length, vNorm.length, 1);
    if (!best || ratio < best.ratio) best = { v, ratio };
  }
  if (best && best.ratio <= FUZZY_MAX_RATIO) return { status: "fuzzy", value: best.v, requested };

  return {
    status: "unmapped",
    value: null,
    requested,
    reason: vocabulary.length
      ? `"${requested}" doesn't match any real value on file for this field.`
      : `This field has no fixed set of values to check against.`,
  };
}

const OPERATOR_PHRASE: Record<string, string> = {
  equals: "is", not_equals: "is not", contains: "includes",
  gt: "is above", lt: "is below", between: "is between",
  before: "is before", after: "is after", in_last_days: "is within the last",
  is_true: "is", is_false: "is",
};

/** Plain-English bullet list generated from the FINAL, resolved rule tree —
 *  never from the raw LLM response — so the explanation can never describe
 *  something that isn't actually in the applied rule. */
export function explainRuleTree(node: RuleNode, negate = false): string[] {
  if (node.type === "condition") {
    const label = SEGMENT_FIELDS.find((f) => f.key === node.field)?.label || node.field;
    const phrase = OPERATOR_PHRASE[node.operator] || node.operator;
    let valueText = node.value ?? "";
    if (node.operator === "between") {
      const [a, b] = decodeRange(node.value);
      valueText = `${a} and ${b}`;
    } else if (node.operator === "in_last_days") {
      valueText = `${node.value} days`;
    } else if (node.operator === "is_true") {
      valueText = "true";
    } else if (node.operator === "is_false") {
      valueText = "false";
    }
    const line = `${label} ${negate ? "is not" : phrase}${valueText ? ` ${valueText}` : ""}`.replace(/\s+/g, " ").trim();
    return [line];
  }

  if (node.operator === "NOT") {
    return node.children.flatMap((c) => explainRuleTree(c, true).map((l) => `Excludes: ${l.replace(/^Excludes: /, "")}`));
  }
  const lines = node.children.flatMap((c) => explainRuleTree(c, negate));
  if (node.operator === "ANY" && node.children.length > 1) {
    return [`Any of: ${lines.join("; ")}`];
  }
  return lines;
}
