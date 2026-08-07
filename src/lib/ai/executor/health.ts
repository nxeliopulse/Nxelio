/**
 * ============================================================================
 * Phase 1 — Tool Health
 * ============================================================================
 * Rolling execution stats per tool: counts, success rate, average duration,
 * last error. Fed by the executor on every run; consumed by admin surfaces
 * (and future self-healing logic). In-memory only — no persistence.
 * ============================================================================
 */

export interface ToolHealthStats {
  executions: number;
  failures: number;
  /** Sum of durations in ms — divide by executions for the average. */
  totalDurationMs: number;
  avgDurationMs: number;
  /** 0..1 — (executions - failures) / executions. 1 when never executed. */
  successRate: number;
  lastExecutionAt?: number;
  lastFailureAt?: number;
  lastError?: string;
}

const EMPTY = (): ToolHealthStats => ({
  executions: 0,
  failures: 0,
  totalDurationMs: 0,
  avgDurationMs: 0,
  successRate: 1,
});

export class ToolHealthStore {
  private stats = new Map<string, ToolHealthStats>();

  record(toolId: string, startedAt: number, finishedAt: number, ok: boolean, errorCode?: string, errorMessage?: string): void {
    const s = this.stats.get(toolId) ?? EMPTY();
    s.executions += 1;
    const duration = Math.max(0, finishedAt - startedAt);
    s.totalDurationMs += duration;
    s.avgDurationMs = Math.round(s.totalDurationMs / s.executions);
    s.lastExecutionAt = finishedAt;
    if (!ok) {
      s.failures += 1;
      s.lastFailureAt = finishedAt;
      s.lastError = errorCode ? `${errorCode}: ${errorMessage ?? "unknown error"}` : errorMessage;
    }
    s.successRate = (s.executions - s.failures) / s.executions;
    this.stats.set(toolId, s);
  }

  get(toolId: string): ToolHealthStats | undefined {
    return this.stats.get(toolId);
  }

  snapshot(): Record<string, ToolHealthStats> {
    return Object.fromEntries(
      [...this.stats.entries()].map(([id, s]) => [id, { ...s }])
    );
  }
}
