/**
 * Phase 3 — Intent Planner execution engine.
 *
 * This module is deliberately independent from Supabase, React, and the LLM.
 * The caller injects a ToolRunner. In production that runner is the Phase 1
 * ToolExecutor, so permission checks, argument validation, audit hooks,
 * approval, retries, and safe errors remain in one security boundary.
 */
import type { Plan, PlanExecution, PlanStep, PlanValidationResult, StepExecution } from "@/lib/ai/planner/types";

export type ToolRunner = (
  tool: string,
  args: Record<string, unknown>
) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

export interface ExecutePlanOptions {
  /** Reads retry attempts (default 2), writes 1. */
  readAttempts?: number;
  writeAttempts?: number;
  /** Base delay (ms) for retry backoff — doubled per retry. */
  backoffMs?: number;
  /** Continue independent work after a failure (default false). */
  continueOnFail?: boolean;
  /** Run ready independent steps concurrently (default true). */
  parallel?: boolean;
  /** Writes are held at an approval checkpoint unless this is true. */
  approveWrites?: boolean;
  /** Optional known tool ids for a second, runtime plan validation. */
  knownTools?: ReadonlySet<string>;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}

/** Validates the graph before any tool is called. Fails closed on bad plans. */
export function validatePlan(plan: Plan, knownTools?: ReadonlySet<string>): PlanValidationResult {
  const errors: string[] = [];
  if (!plan || typeof plan !== "object") return { ok: false, errors: ["Plan must be an object."] };
  if (!plan.intent?.trim()) errors.push("Plan intent is required.");
  if (!plan.goal?.trim()) errors.push("Plan goal is required.");
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push("Plan must contain at least one step.");

  const ids = new Set<string>();
  for (const step of plan.steps ?? []) {
    if (!step.id || ids.has(step.id)) errors.push(`Step id "${step.id || ""}" is missing or duplicated.`);
    ids.add(step.id);
    if (!step.tool?.trim()) errors.push(`Step "${step.id}" has no tool.`);
    if (knownTools && !knownTools.has(step.tool)) errors.push(`Step "${step.id}" references unknown tool "${step.tool}".`);
    if (step.args && !isJsonValue(step.args)) errors.push(`Step "${step.id}" contains non-JSON arguments.`);
    for (const dependency of step.depends_on ?? []) {
      if (dependency === step.id) errors.push(`Step "${step.id}" cannot depend on itself.`);
      if (!plan.steps.some((candidate) => candidate.id === dependency)) {
        errors.push(`Step "${step.id}" depends on missing step "${dependency}".`);
      }
    }
  }

  // A small DFS catches cycles before the scheduler can deadlock.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(plan.steps?.map((step) => [step.id, step]) ?? []);
  function visit(id: string): void {
    if (visiting.has(id)) { errors.push(`Plan contains a dependency cycle at "${id}".`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.depends_on ?? []) if (byId.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/** Resolve a single "$step.path" reference against a completed step. */
export function resolveRef(value: unknown, results: Map<string, unknown>): unknown {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const match = value.match(/^\$([A-Za-z0-9_-]+)(.*)$/);
  if (!match || !match[2]) return value;
  const target = results.get(match[1]);
  if (target === undefined) return value;

  let current: unknown = target;
  const tokens = match[2].match(/\.[A-Za-z_]\w*|\[(?:\d+|"[^"]*"|'[^']*')\]/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith(".")) {
      if (!current || typeof current !== "object") return value;
      current = (current as Record<string, unknown>)[token.slice(1)];
    } else {
      if (!current || typeof current !== "object") return value;
      const key = token.slice(1, -1).replace(/^['"]|['"]$/g, "");
      current = Array.isArray(current) && /^\d+$/.test(key)
        ? current[Number(key)]
        : (current as Record<string, unknown>)[key];
    }
    if (current === undefined) return value;
  }
  return current;
}

function resolveDeep(value: unknown, results: Map<string, unknown>): unknown {
  if (typeof value === "string") return resolveRef(value, results);
  if (Array.isArray(value)) return value.map((child) => resolveDeep(child, results));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, resolveDeep(child, results)])
    );
  }
  return value;
}

function dependenciesReady(step: PlanStep, executions: Map<string, StepExecution>): boolean {
  return (step.depends_on ?? []).every((id) => executions.get(id)?.status === "success");
}

function dependenciesBlocked(step: PlanStep, executions: Map<string, StepExecution>): boolean {
  return (step.depends_on ?? []).some((id) => {
    const status = executions.get(id)?.status;
    return status === "failed" || status === "skipped";
  });
}

export async function executePlan(
  plan: Plan,
  run: ToolRunner,
  opts: ExecutePlanOptions = {},
): Promise<PlanExecution> {
  const startedAt = Date.now();
  const executions: StepExecution[] = plan.steps.map((step) => ({ step, status: "pending", attempts: 0 }));
  const byId = new Map(executions.map((execution) => [execution.step.id, execution]));
  const results = new Map<string, unknown>();
  const failed: StepExecution[] = [];
  const validation = validatePlan(plan, opts.knownTools);

  if (!validation.ok) {
    const first = executions[0] ?? { step: { id: "plan", tool: "", label: "Invalid plan" }, status: "failed", attempts: 0 } as StepExecution;
    first.status = "failed";
    first.error = validation.errors.join(" ");
    failed.push(first);
    return { plan, steps: executions, ok: false, failed, awaitingApproval: [], startedAt, finishedAt: Date.now() };
  }

  const readAttempts = Math.max(1, opts.readAttempts ?? 2);
  const writeAttempts = Math.max(1, opts.writeAttempts ?? 1);
  const backoffMs = Math.max(0, opts.backoffMs ?? 300);

  async function runOne(execution: StepExecution): Promise<void> {
    const args = resolveDeep(execution.step.args ?? {}, results) as Record<string, unknown>;
    const isWrite = execution.step.requires_approval === true;
    const maxAttempts = isWrite ? writeAttempts : readAttempts;
    execution.status = "running";
    execution.startedAt = Date.now();
    let outcome: { ok: boolean; data?: unknown; error?: string } = { ok: false, error: "unknown error" };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      execution.attempts = attempt;
      try {
        outcome = await run(execution.step.tool, args);
      } catch (error) {
        outcome = { ok: false, error: error instanceof Error ? error.message : "step failed" };
      }
      if (outcome.ok) break;
      if (attempt < maxAttempts && backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt - 1)));
      }
    }
    execution.finishedAt = Date.now();
    if (outcome.ok) {
      execution.status = "success";
      execution.result = outcome.data;
      results.set(execution.step.id, outcome.data);
    } else {
      execution.status = "failed";
      execution.error = outcome.error ?? "step failed";
      failed.push(execution);
    }
  }

  while (executions.some((execution) => execution.status === "pending")) {
    for (const execution of executions) {
      if (execution.status === "pending" && dependenciesBlocked(execution.step, byId)) execution.status = "skipped";
    }

    const ready = executions.filter((execution) => execution.status === "pending" && dependenciesReady(execution.step, byId));
    const gated = ready.filter((execution) => execution.step.requires_approval && !opts.approveWrites);
    for (const execution of gated) execution.status = "awaiting_approval";
    const runnable = ready.filter((execution) => !gated.includes(execution));
    if (runnable.length === 0) break;

    if (opts.parallel === false) {
      for (const execution of runnable) {
        await runOne(execution);
        if (failed.length > 0 && !opts.continueOnFail) break;
      }
    } else {
      await Promise.all(runnable.map((execution) => runOne(execution)));
    }

    if (failed.length > 0 && !opts.continueOnFail) {
      for (const execution of executions) if (execution.status === "pending") execution.status = "skipped";
      break;
    }
  }

  const awaitingApproval = executions.filter((execution) => execution.status === "awaiting_approval");
  const complete = executions.every((execution) => execution.status === "success" || execution.status === "skipped");
  return {
    plan,
    steps: executions,
    ok: failed.length === 0 && awaitingApproval.length === 0 && complete,
    failed,
    awaitingApproval,
    startedAt,
    finishedAt: Date.now(),
  };
}
