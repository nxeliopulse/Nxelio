/**
 * ============================================================================
 * Phase 1 — Tool Executor
 * ============================================================================
 * The single execution path for every tool:
 *
 *   1. Lookup in registry (fail closed if unknown)
 *   2. Permission check via security.validateToolPermission (fail closed)
 *   3. Argument validation via registry/validator (fail with safe errors)
 *   4. Handler run — reads may auto-retry ONCE on retryable errors;
 *      writes NEVER retry (Phase 0 semantics preserved)
 *   5. Outcome recorded: execution record, health stats, timeline step,
 *      streaming event; write undos handed to the RollbackManager
 *
 * Every thrown error crosses toSafeError before surfacing — no stack
 * traces or internals ever reach the user or the model.
 * ============================================================================
 */
import { randomUUID } from "crypto";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionRecord,
  ToolResult,
} from "@/lib/ai/registry/types";
import { ToolRegistry } from "@/lib/ai/registry/registry";
import { throwIfInvalid } from "@/lib/ai/registry/validator";
import { ToolError, toSafeError } from "@/lib/ai/executor/errors";
import { ExecutionTimeline } from "@/lib/ai/executor/timeline";
import { ToolHealthStore } from "@/lib/ai/executor/health";
import { RollbackManager } from "@/lib/ai/executor/rollback";
import { StreamingManager } from "@/lib/ai/executor/streaming";
import { validateToolPermission, type AiCallerContext } from "@/lib/ai/security";

export interface ExecuteOptions {
  timeline?: ExecutionTimeline;
  stream?: StreamingManager;
  /** The requester's email (e.g. for send_contact_email replyTo) — approval flow only. */
  requesterEmail?: string | null;
  /** Fired on every status change (pending → running → success|failed). */
  onRecord?: (record: ToolExecutionRecord) => void;
}

/** Reads auto-retry once on retryable errors; writes never retry. */
const RETRY_ATTEMPTS: Record<string, number> = { read: 2, write: 1 };

export class ToolExecutor {
  readonly health: ToolHealthStore;
  readonly rollbacks: RollbackManager;

  constructor(
    private readonly registry: ToolRegistry,
    health?: ToolHealthStore,
    rollbacks?: RollbackManager,
  ) {
    this.health = health ?? new ToolHealthStore();
    this.rollbacks = rollbacks ?? new RollbackManager();
  }

  /**
   * Executes one tool end-to-end. Throws a safe ToolError on any failure —
   * callers wrap it in try/catch (assistant.ts already does).
   */
  async execute(
    toolId: string,
    rawArgs: unknown,
    callerCtx: AiCallerContext,
    opts: ExecuteOptions = {},
  ): Promise<ToolResult> {
    const tool = this.registry.get(toolId);
    if (!tool) {
      const err = ToolError.notFound(`Tool "${toolId}" is not registered.`);
      throw err;
    }

    const executionId = randomUUID();
    const startedAt = Date.now();
    const label = tool.progressLabel ?? tool.name;
    const record: ToolExecutionRecord = {
      executionId,
      toolId,
      status: "running",
      startedAt,
      attempts: 0,
    };

    opts.stream?.begin("tool", label);
    opts.timeline?.add(label, "running");
    opts.onRecord?.(record);

    try {
      // 1. Permission — belt & suspenders; the model list is already filtered.
      const perm = validateToolPermission(toolId, callerCtx);
      if (!perm.allowed) throw new ToolError("permission", perm.reason ?? "Access denied.");

      // 2. Argument validation.
      const args = throwIfInvalid(tool, rawArgs);

      // 3. Handler run with read-only auto-retry.
      const ctx: ToolExecutionContext = {
        callerCtx,
        requesterEmail: opts.requesterEmail,
        executionId,
      };
      const result = await this.runWithRetry(tool, args, ctx, record);

      // 4. Record success.
      record.status = "success";
      record.finishedAt = Date.now();
      record.durationMs = record.finishedAt - startedAt;
      record.result = result;
      this.health.record(toolId, startedAt, record.finishedAt, true);
      if (result.undo && tool.mode === "write") {
        this.rollbacks.record(executionId, toolId, result.undo);
      }
      opts.timeline?.complete(label);
      opts.stream?.done();
      opts.onRecord?.(record);
      return result;
    } catch (rawErr) {
      const err = toSafeError(rawErr, toolId);
      record.status = "failed";
      record.finishedAt = Date.now();
      record.durationMs = record.finishedAt - startedAt;
      record.error = { code: err.code, message: err.message, retryable: err.retryable };
      this.health.record(toolId, startedAt, record.finishedAt, false, err.code, err.message);
      opts.timeline?.fail(label);
      opts.stream?.fail();
      opts.onRecord?.(record);
      throw err;
    }
  }

  /** Applies undo hooks recorded for this execution (reverse order). */
  async rollback(executionId: string): Promise<string[]> {
    return this.rollbacks.apply(executionId);
  }

  private async runWithRetry(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
    record: ToolExecutionRecord,
  ): Promise<ToolResult> {
    const maxAttempts = RETRY_ATTEMPTS[tool.mode] ?? 1;
    let lastErr: ToolError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      record.attempts = attempt;
      try {
        return await tool.handler(args, ctx);
      } catch (rawErr) {
        lastErr = toSafeError(rawErr, tool.id);
        if (!lastErr.retryable || attempt >= maxAttempts) throw lastErr;
        // Brief linear backoff before the single retry.
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    throw lastErr ?? ToolError.failed(`${tool.id} failed.`);
  }
}
