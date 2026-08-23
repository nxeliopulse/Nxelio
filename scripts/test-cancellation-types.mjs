import test from "node:test";
import assert from "node:assert/strict";
import { REASON_LABELS } from "../src/lib/queries/cancellation-types.ts";

const VALID_REASONS = [
  "too_expensive",
  "missing_features",
  "found_alternative",
  "not_using",
  "technical_issues",
  "business_closed",
  "other",
];

test("REASON_LABELS has an entry for every valid reason", () => {
  for (const reason of VALID_REASONS) {
    assert.ok(reason in REASON_LABELS, `Missing label for reason: ${reason}`);
  }
});

test("REASON_LABELS values are non-empty strings", () => {
  for (const [key, label] of Object.entries(REASON_LABELS)) {
    assert.ok(typeof label === "string" && label.trim().length > 0, `Empty label for: ${key}`);
  }
});

test("REASON_LABELS has no extra keys beyond the valid set", () => {
  const validSet = new Set(VALID_REASONS);
  for (const key of Object.keys(REASON_LABELS)) {
    assert.ok(validSet.has(key), `Unexpected key in REASON_LABELS: ${key}`);
  }
});

test("REASON_LABELS count matches valid reasons count", () => {
  assert.equal(Object.keys(REASON_LABELS).length, VALID_REASONS.length);
});

// Spot-check human-readable labels
test("too_expensive has a human-readable label", () => {
  assert.match(REASON_LABELS["too_expensive"], /expensive/i);
});

test("missing_features has a human-readable label", () => {
  assert.match(REASON_LABELS["missing_features"], /feature/i);
});
