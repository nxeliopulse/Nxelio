/**
 * ============================================================================
 * Phase 1 — Error Recovery
 * ============================================================================
 * ToolError carries a user-safe message + machine code + retry flag. Stack
 * traces and internal details NEVER cross this boundary — the executor
 * normalizes every thrown error through toSafeError before it can surface.
 * ============================================================================
 */

export type ToolErrorCode =
  | "validation"       // bad/missing args
  | "not_found"        // record referenced by id/name doesn't exist
  | "permission"       // role/nav denied (should be pre-filtered, but fail closed)
  | "provider"         // downstream API (email, LLM) failed
  | "tool_failed"      // handler threw unexpectedly
  | "retry_exhausted"; // transient failure after retries

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;

  constructor(code: ToolErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.retryable = retryable;
  }

  static validation(message: string): ToolError {
    return new ToolError("validation", message);
  }
  static notFound(message: string): ToolError {
    return new ToolError("not_found", message);
  }
  static provider(message: string, retryable = false): ToolError {
    return new ToolError("provider", message, retryable);
  }
  static failed(message: string): ToolError {
    return new ToolError("tool_failed", message);
  }
}

/**
 * Normalizes ANY thrown value into a safe ToolError:
 * - ToolError passes through untouched
 * - everything else becomes a generic, non-retryable "tool_failed"
 *   with a message that never includes stack traces or internal details.
 */
export function toSafeError(err: unknown, toolId: string): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof Error) {
    // Known infra-level failures that are safe to relay + retryable.
    const msg = err.message || "unknown error";
    if (/fetch failed|network|timeout|ETIMEDOUT|ECONNRESET|connection/i.test(msg)) {
      return new ToolError("provider", `${toolId}: a network error occurred — please try again.`, true);
    }
    if (/rate limit|429|too many requests/i.test(msg)) {
      return new ToolError("provider", `${toolId}: the provider is busy — please try again shortly.`, true);
    }
    return ToolError.failed(`${toolId} failed.`);
  }
  return ToolError.failed(`${toolId} failed.`);
}
