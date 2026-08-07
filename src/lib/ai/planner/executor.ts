/**
 * ============================================================================
 * Phase 3 M1 — Intent Planner: plan executor
 * ============================================================================
 * Executes a Plan in dependency order:
 *   - steps run topologically (depends_on must reference earlier steps);
 *   - `$ref` args are resolved against completed step results before running;
 *   - transient failures retry with backoff (reads 2 attempts, writes 1 —
 *     mirroring the Phase 1 executor semantics);
 *   - stop-on-failure by default: dependents are marked skipped;
 *   - every step gets a status record (pending/running/success/failed/skipped).
 *
 * The tool runner is injected so this module stays pure and testable; the
 * assistant wires it to the real Phase 1 executor (which adds permission
 * checks, approval for writes, timeline/health/streaming).
 * ============================================================================
 */
import type { Plan, PlanExecution, StepExecution } from "@/lib/ai/planner/types";

export type ToolRunner = (tool: string, args: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

export interface ExecutePlanOptions {
  /** Reads retry attempts (default 2), writes 1. */
  readAttempts?: number;
  writeAttempts?: number;
  /** Base delay (ms) for retry backoff — doubled per retry. */
  backoffMs?: number;
  /** Continue running independent steps after a failure (default false). */
  continueOnFail?: boolean;
}

/** Pulls "$stepId.path" out of an arg value (string only, top level). */
export function resolveRef(value: unknown, results: Map<string, unknown>): unknown {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const m = value.match(/^\$([\w-]+)(?:\.[\w\d\[\]'"]+)+$/);
  if (!m) return value;
  const stepId = m[1];
  const path = value.slice(stepId.length + 1); // ".rows[0].id"
  const target = results.get(stepId);
  if (target === undefined) return value; // unresolved — leave for the tool runner to fail loudly
  let cur: unknown = target;
  for (const part of path.match(/\.[A-Za-z_]\w*|\[\d+\]|\["[^"]*"\]|\['\w+'\]/g) ?? []) {
    if (part.startsWith(".")) cur = (cur as Record<string, unknown>)?.[part.slice(1)];
    else if (part.startsWith("[")) {
      const inner = part.slice(1, -1);
      const idx = Number(inner);
      cur = Array.isArray(cur) && Number.isInteger(idx) ? cur[idx] : (cur as Record<string, unknown>)?.[inner.replace(/^["']|["']$/g, "")];
    }
    if (cur === undefined) return value;
  }
  return cur;
}

export async function executePlan(plan: Plan, run: ToolRunner, opts: ExecutePlanOptions = {}): Promise<PlanExecution> {
  const readAttempts = opts.readAttempts ?? 2;
  const writeAttempts = opts.writeAttempts ?? 1;
  const backoffMs = opts.backoffMs ?? 300;
  const startedAt = Date.now();
  const executions: StepExecution[] = plan.steps.map((step) => ({ step, status: "pending", attempts: 0 }));
  const results = new Map<string, unknown>();
  const failed: StepExecution[] = [];

  for (const ex of executions) {
    if (ex.step.depends_on?.some((d) => {
      const dep = executions.find((e) => e.step.id === d);
      return !dep || dep.status !== "success";
    })) {
      ex.status = "skipped";
      continue;
    }
    // Resolve args ($refs against completed steps)
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ex.step.args ?? {})) args[k] = resolveRef(v, results);

    ex.status = "running";
    ex.startedAt = Date.now();
    const isWrite = ex.step.requires_approval ?? false;
    const maxAttempts = isWrite ? writeAttempts : readAttempts;
    let outcome: { ok: boolean; data?: unknown; error?: string } | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      ex.attempts = attempt;
      try {
        outcome = await run(ex.step.tool, args);
      } catch (e) {
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (outcome.ok) break;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
    }
    ex.finishedAt = Date.now();
    if (outcome?.ok) {
      ex.status = "success";
      ex.result = outcome.data;
      results.set(ex.step.id, outcome.data);
    } else {
      ex.status = "failed";
      ex.error = outcome?.error ?? "unknown error";
      failed.push(ex);
      if (!opts.continueOnFail) break; // dependents get marked skipped below
    }
  }

  // Mark remaining dependents of failed steps as skipped.
  for (const ex of executions) {
    if (ex.status !== "pending") continue;
    const blocked = ex.step.depends_on?.some((d) => {
      const dep = executions.find((e) => e.step.id === d);
      return dep?.status === "failed" || dep?.status === "skipped";
    });
    if (blocked) ex.status = "skipped";
  }

  return {
    plan,
    steps: executions,
    ok: failed.length === 0 && executions.every((e) => e.status === "success" || e.status === "skipped"),
    failed,
    startedAt,
    finishedAt: Date.now(),
  };
}
