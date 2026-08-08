import test from "node:test";
import assert from "node:assert/strict";
import {
  containsSensitiveValue,
  isMemoryExpired,
  memoryMatchesQuery,
  normalizeMemoryKey,
  summarizeMemories,
  validateMemoryValue,
} from "../src/lib/ai/memory-policy.ts";

const base = {
  id: "1",
  workspace_id: "ws",
  user_id: null,
  scope: "workspace",
  category: "tone",
  memory_key: "Writing tone",
  value: "Use short, confident sentences.",
  source: "test",
  expires_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("memory policy rejects secrets and keeps safe values", () => {
  assert.equal(containsSensitiveValue("api_key=sk-test_123456789012"), true);
  assert.equal(validateMemoryValue("api_key=sk-test_123456789012").ok, false);
  assert.deepEqual(validateMemoryValue("  Use our blue brand tone.  "), { ok: true, value: "Use our blue brand tone." });
});

test("memory keys normalize and memory expiry is enforced", () => {
  assert.equal(normalizeMemoryKey("  favorite   template "), "favorite template");
  assert.equal(isMemoryExpired("2026-01-01T00:00:00.000Z", Date.parse("2026-01-02T00:00:00.000Z")), true);
  assert.equal(isMemoryExpired(null), false);
});

test("memory search and summaries use only active matching records", () => {
  const records = [
    base,
    { ...base, id: "2", memory_key: "Audience", category: "audience", value: "B2B SaaS founders" },
    { ...base, id: "3", memory_key: "Expired", value: "ignore me", expires_at: "2025-01-01T00:00:00.000Z" },
  ];
  assert.equal(memoryMatchesQuery(records[0], "tone"), true);
  assert.equal(memoryMatchesQuery(records[1], "founders"), true);
  assert.match(summarizeMemories(records), /Writing tone/);
  assert.match(summarizeMemories(records), /Audience/);
  assert.doesNotMatch(summarizeMemories(records), /Expired/);
});
