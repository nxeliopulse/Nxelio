import type { AgentId, AgentRoute, SharedAgentContext } from "@/lib/ai/agents/types";
import { agentRegistry, AgentRegistry } from "@/lib/ai/agents/registry";

const DEFAULT_AGENT: AgentId = "support";

export class AgentRouter {
  private readonly registry: AgentRegistry;

  constructor(registry: AgentRegistry = agentRegistry) {
    this.registry = registry;
  }

  route(goal: string): AgentRoute {
    const normalized = goal.toLowerCase();
    const scored = this.registry.list().map((agent) => ({
      agent,
      score: agent.routingKeywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score === 0) {
      return { primary: DEFAULT_AGENT, delegates: [], confidence: "low", reason: "No specialist signal matched; routed to Support." };
    }

    const delegates = scored
      .slice(1)
      .filter((entry) => entry.score > 0)
      .map((entry) => entry.agent.id)
      .slice(0, 2);
    return {
      primary: best.agent.id,
      delegates,
      confidence: best.score >= 2 ? "high" : "medium",
      reason: `Matched ${best.agent.name} keywords for this request.`,
    };
  }

  /** Creates the shared request context and records master-to-agent handoffs. */
  delegate(goal: string, context: SharedAgentContext): AgentRoute {
    const route = this.route(goal);
    context.memory.remember("primary_agent", route.primary, 15 * 60 * 1000);
    context.bus.send({ from: "master", to: route.primary, kind: "task", content: goal });
    for (const agentId of route.delegates) {
      context.bus.send({ from: "master", to: agentId, kind: "handoff", content: `Review this request for ${agentId} expertise: ${goal}` });
    }
    return route;
  }
}

export const agentRouter = new AgentRouter();
