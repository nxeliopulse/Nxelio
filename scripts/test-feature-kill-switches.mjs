import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveEnabled, ALL_KILL_SWITCH_FEATURES, FEATURE_LABELS, DEFAULT_LOCKED_FEATURES } from "../src/lib/kill-switch-rules.ts";

test("resolveEffectiveEnabled: platform admin always bypasses, even when the raw switch is off", () => {
  assert.equal(resolveEffectiveEnabled(true, false), true);
  assert.equal(resolveEffectiveEnabled(true, true), true);
});

test("resolveEffectiveEnabled: a regular user gets the real flag, no bypass", () => {
  assert.equal(resolveEffectiveEnabled(false, true), true);
  assert.equal(resolveEffectiveEnabled(false, false), false);
});

test("ALL_KILL_SWITCH_FEATURES lists exactly the four switches this feature ships", () => {
  assert.deepEqual(
    [...ALL_KILL_SWITCH_FEATURES].sort(),
    ["launch_campaign", "send_email", "send_newsletter", "verified_emails_source"]
  );
});

test("every feature key has a human-readable label for its error message", () => {
  for (const key of ALL_KILL_SWITCH_FEATURES) {
    assert.ok(FEATURE_LABELS[key] && FEATURE_LABELS[key].length > 0, `missing label for ${key}`);
  }
});

test("DEFAULT_LOCKED_FEATURES names only preview features that ship off, not the incident kill switches", () => {
  assert.deepEqual(DEFAULT_LOCKED_FEATURES, ["verified_emails_source"]);
  for (const key of DEFAULT_LOCKED_FEATURES) {
    assert.ok(ALL_KILL_SWITCH_FEATURES.includes(key), `${key} must also be a real feature key`);
  }
});
