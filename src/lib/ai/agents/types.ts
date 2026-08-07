import type { AiCallerContext } from "@/lib/ai/security";

export type AgentId = "sales" | "marketing" | "analytics" | "content" | "support" | "admin";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  systemPrompt: string;
  /** Tool ids this specialist may request. Security still checks each call. */
  toolIds: string[];
  /** Weighted phrases used by the deterministic router. */
  routingKeywords: string[];
}

export interface AgentRoute {
  primary: AgentId;
  delegates: AgentId[];
  confidence: "low" | "medium" | "high";
  reason: string;
}

export interface AgentMessage {
  id: string;
  from: AgentId | "master";
  to: AgentId | "broadcast";
  kind: "task" | "result" | "question" | "handoff";
  content: string;
  createdAt: number;
}

export interface SharedAgentContextOptions {
  requestId: string;
  goal: string;
  callerCtx: AiCallerContext;
  userId?: string;
  page?: { pathname: string; label: string };
}

export interface SharedAgentContext {
  readonly requestId: string;
  readonly goal: string;
  readonly callerCtx: AiCallerContext;
  readonly userId?: string;
  readonly page?: { pathname: string; label: string };
  readonly memory: AgentMemory;
  readonly bus: AgentMessageBus;
}

export interface AgentMemoryEntry {
  key: string;
  value: string;
  createdAt: number;
  expiresAt?: number;
}

export interface AgentMemory {
  remember(key: string, value: string, ttlMs?: number): boolean;
  recall(key: string): string | undefined;
  search(query: string): AgentMemoryEntry[];
  summarize(): string;
  forget(key: string): void;
  snapshot(): AgentMemoryEntry[];
}

export interface AgentMessageBus {
  send(message: Omit<AgentMessage, "id" | "createdAt">): AgentMessage;
  broadcast(message: Omit<AgentMessage, "id" | "createdAt" | "to">): AgentMessage;
  messages(): AgentMessage[];
  forAgent(agentId: AgentId): AgentMessage[];
}
