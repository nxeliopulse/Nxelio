import test from "node:test";
import assert from "node:assert/strict";
import { getContextualAssistantProfile, getContextualAssistantProfiles } from "../src/lib/ai/contextual.ts";

const routeCases = [
  ["/leads/lead-123", "leads"],
  ["/campaigns", "campaigns"],
  ["/segments/high-intent", "segments"],
  ["/analytics/reports/weekly", "analytics"],
  ["/templates", "templates"],
  ["/newsletters/draft", "newsletters"],
  ["/settings/ai", "settings"],
  ["/unknown-area", "generic"],
];

test("selects the contextual profile from the current route", () => {
  for (const [pathname, expectedId] of routeCases) {
    assert.equal(getContextualAssistantProfile(pathname).id, expectedId, `${pathname} should use ${expectedId}`);
  }
});

test("every profile has useful guidance and safe suggestions", () => {
  const profiles = getContextualAssistantProfiles();
  assert.ok(profiles.length >= 16);
  for (const current of profiles) {
    assert.ok(current.systemPrompt.length > 80, `${current.id} needs meaningful guidance`);
    assert.ok(current.focusModules.length >= 2, `${current.id} needs focus areas`);
    assert.ok(current.suggestions.length >= 3, `${current.id} needs quick suggestions`);
    assert.match(current.systemPrompt, /Never invent|never invent/i, `${current.id} needs data guardrails`);
  }
});
