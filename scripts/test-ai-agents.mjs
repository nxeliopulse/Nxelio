import test from "node:test";
import assert from "node:assert/strict";
import { agentRegistry } from "../src/lib/ai/agents/registry.ts";
import { AgentRouter } from "../src/lib/ai/agents/router.ts";
import { createSharedAgentContext } from "../src/lib/ai/agents/memory.ts";

const callerCtx = { roleId: 3, roleName: "Sales Admin", navAccess: null };

test("registry contains all six specialist agents", () => {
  assert.deepEqual(agentRegistry.list().map((agent) => agent.id), ["sales", "marketing", "analytics", "content", "support", "admin"]);
});

test("router selects a primary agent and delegates cross-functional work", () => {
  const router = new AgentRouter(agentRegistry);
  const route = router.route("Review campaign performance and revenue conversion");
  assert.equal(route.primary, "analytics");
  assert.ok(route.delegates.includes("marketing"));
});

test("shared context records handoffs and blocks secrets from agent memory", () => {
  const context = createSharedAgentContext({ requestId: "test-1", goal: "Improve lead follow-up", callerCtx });
  const router = new AgentRouter(agentRegistry);
  const route = router.delegate("Improve lead follow-up", context);

  assert.equal(route.primary, "sales");
  assert.equal(context.memory.recall("active_goal"), "Improve lead follow-up");
  assert.equal(context.memory.remember("api", "api_key=super-secret-value"), false);
  assert.ok(context.bus.forAgent("sales").some((message) => message.from === "master"));
});

test("agent tool exposure remains permission-driven", () => {
  const allowed = agentRegistry.allowedToolIds("sales", callerCtx, (toolId) => toolId === "search_leads");
  assert.deepEqual(allowed, ["search_leads"]);
});
