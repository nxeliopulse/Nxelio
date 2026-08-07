import type { AgentMemory, AgentMemoryEntry, AgentMessage, AgentMessageBus, AgentId, SharedAgentContext, SharedAgentContextOptions } from "@/lib/ai/agents/types";

const MAX_ENTRIES = 50;
const MAX_VALUE_LENGTH = 2_000;
const SENSITIVE_VALUE = /(?:sk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|token|password|secret|private[_-]?key)\s*[:=]|-----BEGIN [^-]+ PRIVATE KEY-----|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i;

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class RequestAgentMemory implements AgentMemory {
  private entries = new Map<string, AgentMemoryEntry>();

  remember(key: string, value: string, ttlMs?: number): boolean {
    const safeKey = key.trim().slice(0, 120);
    const safeValue = value.trim().slice(0, MAX_VALUE_LENGTH);
    if (!safeKey || !safeValue || SENSITIVE_VALUE.test(safeValue)) return false;
    if (!this.entries.has(safeKey) && this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    const now = Date.now();
    this.entries.set(safeKey, {
      key: safeKey,
      value: safeValue,
      createdAt: now,
      ...(ttlMs && ttlMs > 0 ? { expiresAt: now + ttlMs } : {}),
    });
    return true;
  }

  recall(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  search(query: string): AgentMemoryEntry[] {
    const needle = query.trim().toLowerCase();
    return this.snapshot().filter((entry) => !needle || `${entry.key} ${entry.value}`.toLowerCase().includes(needle));
  }

  summarize(): string {
    return this.snapshot().map((entry) => `${entry.key}: ${entry.value}`).join("; ");
  }

  forget(key: string): void {
    this.entries.delete(key);
  }

  snapshot(): AgentMemoryEntry[] {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) this.entries.delete(key);
    }
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }
}

class RequestAgentMessageBus implements AgentMessageBus {
  private readonly log: AgentMessage[] = [];

  send(message: Omit<AgentMessage, "id" | "createdAt">): AgentMessage {
    const complete = { ...message, id: newId("msg"), createdAt: Date.now() };
    this.log.push(complete);
    return complete;
  }

  broadcast(message: Omit<AgentMessage, "id" | "createdAt" | "to">): AgentMessage {
    return this.send({ ...message, to: "broadcast" });
  }

  messages(): AgentMessage[] {
    return this.log.map((message) => ({ ...message }));
  }

  forAgent(agentId: AgentId): AgentMessage[] {
    return this.log.filter((message) => message.to === agentId || message.to === "broadcast").map((message) => ({ ...message }));
  }
}

export function createSharedAgentContext(options: SharedAgentContextOptions): SharedAgentContext {
  const memory = new RequestAgentMemory();
  const bus = new RequestAgentMessageBus();
  // The active goal is useful for specialist handoffs, but the memory guard
  // prevents credentials and tokens from being retained in the request.
  memory.remember("active_goal", options.goal, 15 * 60 * 1000);
  return { ...options, memory, bus };
}
