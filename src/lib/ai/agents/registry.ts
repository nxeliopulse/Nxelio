import type { AiCallerContext } from "@/lib/ai/security";
import type { AgentDefinition, AgentId } from "@/lib/ai/agents/types";

const AGENTS: AgentDefinition[] = [
  {
    id: "sales",
    name: "Sales Agent",
    description: "Works with prospects, contacts, pipeline, follow-ups, and sales outreach.",
    systemPrompt: "Focus on sales execution, lead quality, pipeline movement, and respectful follow-up.",
    toolIds: ["get_workspace_stats", "search_leads", "create_lead", "update_lead", "send_email_to_lead", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "ui_action"],
    routingKeywords: ["lead", "leads", "prospect", "prospects", "pipeline", "opportunity", "deal", "follow-up", "follow up", "sales", "contact"],
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    description: "Works with campaigns, segments, newsletters, audiences, and nurture programs.",
    systemPrompt: "Focus on audience strategy, campaign performance, segmentation, and nurture workflows.",
    toolIds: ["get_workspace_stats", "list_campaigns", "list_segments", "list_templates", "list_newsletters", "create_campaign", "update_campaign", "create_segment", "create_email_template", "send_newsletter", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "ui_action"],
    routingKeywords: ["campaign", "campaigns", "segment", "segments", "audience", "newsletter", "nurture", "marketing", "template", "templates", "email sequence"],
  },
  {
    id: "analytics",
    name: "Analytics Agent",
    description: "Works with workspace metrics, campaign performance, revenue, and reports.",
    systemPrompt: "Focus on measurable outcomes, trends, comparisons, risks, and clearly stated evidence.",
    toolIds: ["get_workspace_stats", "list_campaigns", "search_leads", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "ui_action"],
    routingKeywords: ["analytics", "metric", "metrics", "report", "reports", "revenue", "conversion", "performance", "trend", "insight", "dashboard", "statistics", "stats"],
  },
  {
    id: "content",
    name: "Content Agent",
    description: "Works with email copy, templates, subjects, messaging, and content drafts.",
    systemPrompt: "Focus on clear, accurate, on-brand content. Draft first and never send without approval.",
    toolIds: ["list_templates", "list_campaigns", "create_email_template", "create_campaign", "update_campaign", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "ui_action"],
    routingKeywords: ["write", "draft", "copy", "content", "subject line", "message", "wording", "email text", "email copy"],
  },
  {
    id: "support",
    name: "Support Agent",
    description: "Explains product workflows, navigation, and safe next steps.",
    systemPrompt: "Explain the product simply. Prefer navigation and guidance; do not invent capabilities or data.",
    toolIds: ["get_workspace_stats", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "ui_action"],
    routingKeywords: ["help", "how do", "how can", "where is", "issue", "problem", "support", "billing", "pricing", "settings"],
  },
  {
    id: "admin",
    name: "Admin Agent",
    description: "Works with workspace users, roles, permissions, settings, and administration.",
    systemPrompt: "Focus on workspace administration, access control, settings, and safe permission-aware guidance.",
    toolIds: ["get_workspace_stats", "list_users", "get_workspace_memory", "remember_workspace_memory", "forget_workspace_memory", "get_proactive_alerts", "send_contact_email", "ui_action"],
    routingKeywords: ["admin", "administrator", "user", "users", "role", "roles", "permission", "permissions", "workspace", "access", "settings", "subscription"],
  },
];

export class AgentRegistry {
  private readonly byId = new Map<AgentId, AgentDefinition>();

  constructor(definitions: AgentDefinition[] = AGENTS) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: AgentDefinition): this {
    if (this.byId.has(definition.id)) throw new Error(`AgentRegistry: duplicate agent "${definition.id}"`);
    if (!definition.name || !definition.systemPrompt || definition.toolIds.length === 0) {
      throw new Error(`AgentRegistry: agent "${definition.id}" is incomplete`);
    }
    this.byId.set(definition.id, { ...definition, toolIds: [...definition.toolIds], routingKeywords: [...definition.routingKeywords] });
    return this;
  }

  get(id: AgentId): AgentDefinition | undefined {
    return this.byId.get(id);
  }

  require(id: AgentId): AgentDefinition {
    const agent = this.get(id);
    if (!agent) throw new Error(`Agent "${id}" is not registered.`);
    return agent;
  }

  list(): AgentDefinition[] {
    return [...this.byId.values()].map((agent) => ({ ...agent, toolIds: [...agent.toolIds], routingKeywords: [...agent.routingKeywords] }));
  }

  /** Filters the specialist's tools through the central Phase 0 permission layer. */
  allowedToolIds(
    id: AgentId,
    callerCtx: AiCallerContext,
    canUseTool: (toolId: string, callerCtx: AiCallerContext) => boolean = () => true,
  ): string[] {
    return this.require(id).toolIds.filter((toolId) => canUseTool(toolId, callerCtx));
  }
}

export const agentRegistry = new AgentRegistry();
