import test from "node:test";
import assert from "node:assert/strict";
import { decomposeIntent } from "../src/lib/ai/planner/planner.ts";
import { executePlan, resolveRef, validatePlan } from "../src/lib/ai/planner/executor.ts";

test("decomposeIntent creates an approval-gated multi-step plan", () => {
  const plan = decomposeIntent(
    'Send a follow-up to my new leads with subject: "Welcome" body: "Hi there"',
    { knownTools: new Set(["search_leads", "create_segment", "create_campaign"]) },
  );

  assert.ok(plan);
  assert.deepEqual(plan.steps.map((step) => step.tool), ["search_leads", "create_segment", "create_campaign"]);
  assert.equal(plan.steps[0].requires_approval, false);
  assert.equal(plan.steps[1].requires_approval, true);
  assert.equal(plan.steps[2].requires_approval, true);
  assert.equal("query" in (plan.steps[0].args ?? {}), false, "undefined planner args must be removed");
});

test("resolveRef supports nested object and array paths", () => {
  const results = new Map([["search", { rows: [{ id: "lead-1", profile: { email: "a@example.com" } }] }]]);
  assert.equal(resolveRef("$search.rows[0].profile.email", results), "a@example.com");
});

test("executePlan retries reads and runs independent steps in parallel", async () => {
  const plan = {
    intent: "parallel-test",
    goal: "test",
    steps: [
      { id: "a", tool: "read_a", label: "A" },
      { id: "b", tool: "read_b", label: "B" },
      { id: "c", tool: "read_c", label: "C", depends_on: ["a", "b"], args: { id: "$a.id" } },
    ],
  };
  let active = 0;
  let maxActive = 0;
  let aAttempts = 0;
  const execution = await executePlan(plan, async (tool, args) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (tool === "read_a" && ++aAttempts === 1) return { ok: false, error: "temporary" };
    if (tool === "read_a") return { ok: true, data: { id: "lead-1" } };
    if (tool === "read_b") return { ok: true, data: { ok: true } };
    assert.equal(args.id, "lead-1");
    return { ok: true, data: { done: true } };
  }, { backoffMs: 0 });

  assert.equal(execution.ok, true);
  assert.equal(execution.steps.find((step) => step.step.id === "a")?.attempts, 2);
  assert.ok(maxActive >= 2, "independent steps should overlap");
});

test("executePlan holds writes at an approval checkpoint", async () => {
  let calls = 0;
  const execution = await executePlan({
    intent: "approval-test",
    goal: "test",
    steps: [{ id: "write", tool: "create_lead", label: "Create", requires_approval: true }],
  }, async () => { calls += 1; return { ok: true }; });

  assert.equal(calls, 0);
  assert.equal(execution.ok, false);
  assert.equal(execution.awaitingApproval[0]?.step.id, "write");
});

test("validatePlan rejects cycles and unknown tools", () => {
  const result = validatePlan({
    intent: "bad",
    goal: "bad",
    steps: [
      { id: "a", tool: "missing", label: "A", depends_on: ["b"] },
      { id: "b", tool: "known", label: "B", depends_on: ["a"] },
    ],
  }, new Set(["known"]));

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unknown tool")));
  assert.ok(result.errors.some((error) => error.includes("cycle")));
});
