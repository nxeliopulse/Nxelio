"use server";

/**
 * ============================================================================
 * AI Audit Trail
 * ============================================================================
 * Records every security-relevant AI event into the existing audit_log table
 * (workspace-scoped, RLS-protected, Super-Admin readable). Fire-and-forget:
 * a logging failure must never break the feature being logged.
 *
 * Action namespaces:
 *   ai.tool.executed      — a read tool ran (auto)
 *   ai.tool.approved      — a write tool ran after admin approval
 *   ai.tool.denied        — a tool was blocked by the permission layer
 *   ai.injection.blocked  — a message was blocked by prompt-injection scan
 *   ai.injection.sanitized— a message was cleaned before reaching the model
 *   ai.secret.masked      — a secret was redacted from an AI reply
 *   ai.rate.limited       — a caller exceeded the per-user rate limit
 * ============================================================================
 */

import { logAudit } from "@/lib/queries/audit-log";

export async function auditAiEvent(entry: {
  action: string;
  tool?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAudit({
    action: entry.action,
    entityType: entry.tool ? "ai_tool" : "ai_event",
    entityLabel: entry.tool ?? undefined,
    metadata: entry.metadata ?? undefined,
  });
}

/** A read tool executed automatically. */
export async function auditToolExecuted(tool: string, args: Record<string, unknown>): Promise<void> {
  await auditAiEvent({ action: "ai.tool.executed", tool, metadata: { args } });
}

/** A write tool executed after the admin clicked Approve. */
export async function auditToolApproved(tool: string, args: Record<string, unknown>, result: string): Promise<void> {
  await auditAiEvent({ action: "ai.tool.approved", tool, metadata: { args, result } });
}

/** A tool call was blocked by the permission layer. */
export async function auditToolDenied(tool: string, reason: string): Promise<void> {
  await auditAiEvent({ action: "ai.tool.denied", tool, metadata: { reason } });
}

/** A message was blocked by the prompt-injection scan. */
export async function auditInjectionBlocked(flags: string[]): Promise<void> {
  await auditAiEvent({ action: "ai.injection.blocked", metadata: { flags } });
}

/** A message was sanitized before reaching the model. */
export async function auditInjectionSanitized(flags: string[]): Promise<void> {
  await auditAiEvent({ action: "ai.injection.sanitized", metadata: { flags } });
}

/** A secret was redacted from an AI reply. */
export async function auditSecretMasked(flags: string[]): Promise<void> {
  await auditAiEvent({ action: "ai.secret.masked", metadata: { flags } });
}

/** A caller exceeded the per-user rate limit. */
export async function auditRateLimited(scope: string): Promise<void> {
  await auditAiEvent({ action: "ai.rate.limited", metadata: { scope } });
}