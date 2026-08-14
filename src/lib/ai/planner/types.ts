/**
 * ============================================================================
 * Phase 3 M1 — Intent Planner: types
 * ============================================================================
 * A Plan is an ordered list of PlanSteps. Each step calls one registered AI
 * tool; `depends_on` declares which earlier step must complete first (DAG);
 * `args` may reference a prior step's output via a `$ref` string.
 *
 * $ref syntax: "$<stepId>.<jsonPath>" resolved against that step's result.
 *   - "$search.rows[0].id"  → first lead's id
 *   - "$search.rows"        → the full rows array (chained tool may iterate)
 *   - "$search.ok"          → a top-level result field
 * ============================================================================
 */

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface PlanStep {
  /** Unique id within the plan (also the $ref target). */
  id: string;
  /** Registered AI tool id (validated against the registry at build time). */
  tool: string;
  /** Human label for status lines. */
  label: string;
  /** Args passed to the tool; values may be $ref strings. */
  args?: Record<string, unknown>;
  /** ids of earlier steps that must succeed first. */
  depends_on?: string[];
  /** Whether this step mutates data (needs approval). Derived from tool mode. */
  requires_approval?: boolean;
}

export interface Plan {
  /** Matched intent key (workflow id). */
  intent: string;
  /** The user's original request. */
  goal: string;
  steps: PlanStep[];
}

export interface StepExecution {
  step: PlanStep;
  status: StepStatus;
  /** Tool result (success) or error message (failed). */
  result?: unknown;
  error?: string;
  attempts: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface PlanExecution {
  plan: Plan;
  steps: StepExecution[];
  ok: boolean;
  /** Steps that failed and blocked the rest. */
  failed: StepExecution[];
  /** Steps that require user approval before running. */
  awaitingApproval: StepExecution[];
  startedAt: number;
  finishedAt: number;
}

/** Matches a user goal → a Plan (deterministic; returns null when unmatched). */
export type IntentMatcher = (goal: string) => Plan | null;
