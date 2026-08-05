#!/usr/bin/env node
// AI Builder regression tests — the metadata resolver's core algorithm
// (exact / synonym / fuzzy-containment / unmapped) plus the rule-tree
// evaluator's nested-logic, date, and boolean handling. These are pure,
// deterministic, and need no DB/AI credentials, so they run in CI as-is.
//
// LLM-dependent behavior (does the model phrase a nested ANY correctly, does
// it pass through the user's raw value instead of "correcting" it itself)
// can't be asserted deterministically against a live model — that was
// verified manually against the real OpenAI provider + real DB during
// development (see session notes) and should be re-checked by hand any time
// the system prompt in src/lib/ai/actions.ts changes.
//
// Run: npx tsx scripts/test-ai-builder-resolver.mjs
// (needs tsx, not plain node, to resolve the "@/..." path alias and strip types)
import { resolveAgainstVocabulary } from "../src/lib/ai/segment-value-matching.ts";
import { newGroup, newCondition, leadMatchesTree, isConditionComplete, validateRuleTree, encodeRange } from "../src/lib/segments.ts";

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) console.log(`       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

const industryVocab = ["Technology", "Consulting", "Healthcare", "IT Services and IT Consulting", "Software", "Managed Services (MSP)", "Analytics", "AI"];

// 1. Exact match
check("Exact match: 'IT Services and IT Consulting'", resolveAgainstVocabulary("IT Services and IT Consulting", industryVocab).value, "IT Services and IT Consulting");

// 2. Synonym: MSP -> Managed Services (MSP)
check("Synonym: 'MSP' -> Managed Services", resolveAgainstVocabulary("MSP", industryVocab).value, "Managed Services (MSP)");

// 3. Containment fix for the exact reported bug: IT Services must NOT become Technology
{
  const r = resolveAgainstVocabulary("IT Services", industryVocab);
  check("IT Services resolves to the real value, not 'Technology'", r.value, "IT Services and IT Consulting");
}

// 4. Unsupported/unmapped metric — never invented
check("Unsupported metric: 'Excellent Reputation' -> unmapped", resolveAgainstVocabulary("Excellent Reputation", industryVocab).status, "unmapped");
check("Unsupported field concept: 'Salesforce CRM' -> unmapped", resolveAgainstVocabulary("Salesforce CRM", industryVocab).status, "unmapped");

// 5. Nested logic: ALL[score>20, ANY[Software, IT Services]]
{
  const rule = newGroup("ALL", [
    newCondition("lead_score", "gt", "20"),
    newGroup("ANY", [newCondition("industry", "contains", "Software"), newCondition("industry", "contains", "IT Services")]),
  ]);
  const matchesSoftware = leadMatchesTree({ lead_score: 30, industry: "Software" }, rule);
  const matchesITServices = leadMatchesTree({ lead_score: 30, industry: "IT Services and IT Consulting" }, rule);
  const excludesLowScore = leadMatchesTree({ lead_score: 10, industry: "Software" }, rule);
  const excludesOtherIndustry = leadMatchesTree({ lead_score: 30, industry: "Healthcare" }, rule);
  check("Nested ANY: Software lead with score>20 matches", matchesSoftware, true);
  check("Nested ANY: IT Services lead with score>20 matches", matchesITServices, true);
  check("Nested ANY: low score excluded", excludesLowScore, false);
  check("Nested ANY: unrelated industry excluded", excludesOtherIndustry, false);
}

// 6. Date parsing: between
{
  const rule = newGroup("ALL", [newCondition("created_at", "between", encodeRange("2026-07-01", "2026-07-31"))]);
  check("Date between: inside range matches", leadMatchesTree({ created_at: "2026-07-15T00:00:00Z" }, rule), true);
  check("Date between: outside range excluded", leadMatchesTree({ created_at: "2026-08-15T00:00:00Z" }, rule), false);
}

// 7. Boolean
{
  const rule = newGroup("ALL", [newCondition("verified", "is_true")]);
  check("Boolean is_true: verified=true matches", leadMatchesTree({ verified: true }, rule), true);
  check("Boolean is_true: verified=false excluded", leadMatchesTree({ verified: false }, rule), false);
  check("Boolean condition is complete with no value", isConditionComplete({ type: "condition", field: "verified", operator: "is_true", value: "" }), true);
}

// 8. Structural validation still rejects invalid field/operator/empty groups
check("Validation: invalid field rejected", validateRuleTree(newGroup("ALL", [newCondition("not_a_field", "equals", "x")])).length > 0, true);
check("Validation: 'between' invalid for text field", validateRuleTree(newGroup("ALL", [newCondition("industry", "between", encodeRange("a", "b"))])).length > 0, true);
check("Validation: empty group rejected", validateRuleTree(newGroup("ANY", [])).length > 0, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
