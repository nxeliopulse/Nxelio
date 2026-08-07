/**
 * Pure policy helpers for persistent AI memory.
 *
 * This file has no server or database imports so the safety rules can be
 * tested without a live Supabase connection.
 */

export const MEMORY_MAX_KEY_LENGTH = 120;
export const MEMORY_MAX_VALUE_LENGTH = 4_000;

export type AiMemoryScope = "workspace" | "user";
export type AiMemoryCategory =
  | "preference"
  | "tone"
  | "branding"
  | "workflow"
  | "template"
  | "audience"
  | "context"
  | "custom";

export interface AiMemoryRecord {
  id: string;
  workspace_id: string;
  user_id: string | null;
  scope: AiMemoryScope;
  category: AiMemoryCategory;
  memory_key: string;
  value: string;
  source: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk-|pk-)[A-Za-z0-9_-]{12,}\b/i,
  /\b(?:api[_-]?key|access[_-]?key|client[_-]?secret|token|password|passwd|pwd|secret)\s*[:=]\s*[^\s]+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/i,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/i,
  /\b(?:xox[baprs]-|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{12,}\b/i,
];

export function containsSensitiveValue(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function normalizeMemoryKey(key: string): string {
  return key.trim().replace(/\s+/g, " ").slice(0, MEMORY_MAX_KEY_LENGTH);
}

export function validateMemoryValue(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const normalized = value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (!normalized) return { ok: false, error: "Memory value is required." };
  if (normalized.length > MEMORY_MAX_VALUE_LENGTH) {
    return { ok: false, error: `Memory value must be ${MEMORY_MAX_VALUE_LENGTH} characters or fewer.` };
  }
  if (containsSensitiveValue(normalized)) {
    return { ok: false, error: "Memory cannot contain passwords, tokens, API keys, or private keys." };
  }
  return { ok: true, value: normalized };
}

export function isMemoryExpired(expiresAt: string | null, now = Date.now()): boolean {
  return Boolean(expiresAt && Date.parse(expiresAt) <= now);
}

export function memoryMatchesQuery(memory: AiMemoryRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${memory.memory_key} ${memory.value} ${memory.category}`.toLowerCase().includes(needle);
}

export function summarizeMemories(memories: AiMemoryRecord[], maxLength = 6_000): string {
  const lines: string[] = [];
  for (const memory of memories) {
    if (isMemoryExpired(memory.expires_at)) continue;
    const line = `- [${memory.category}] ${memory.memory_key}: ${memory.value}`;
    if (`${lines.join("\n")}\n${line}`.length > maxLength) break;
    lines.push(line);
  }
  return lines.join("\n");
}
