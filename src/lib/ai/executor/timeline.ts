/**
 * ============================================================================
 * Phase 1 — Execution Timeline
 * ============================================================================
 * Records every step of one assistant response ("✓ Read Workspace Stats",
 * "✓ Search Leads", "… Waiting for Approval"). Pure, dependency-free, and
 * serializable — reusable by future multi-step workflows and admin surfaces.
 * ============================================================================
 */
import type { TimelineStatus, TimelineStep } from "@/lib/ai/registry/types";

export class ExecutionTimeline {
  private _steps: TimelineStep[] = [];
  private runningSince = new Map<string, number>();

  get steps(): readonly TimelineStep[] {
    return this._steps;
  }

  /** Adds a step. Use status "running" to start timing; complete()/fail() to close it. */
  add(label: string, status: TimelineStatus = "done", at = Date.now()): this {
    const step: TimelineStep = { label, status, at };
    if (status === "running") this.runningSince.set(label, at);
    this._steps.push(step);
    return this;
  }

  /** Closes a step previously added as "running". */
  complete(label: string, at = Date.now()): this {
    return this.finish(label, "done", at);
  }

  fail(label: string, at = Date.now()): this {
    return this.finish(label, "failed", at);
  }

  private finish(label: string, status: "done" | "failed", at: number): this {
    const step = this._steps.find((s) => s.label === label);
    const since = this.runningSince.get(label);
    if (step) {
      step.status = status;
      step.at = at;
      if (since !== undefined) step.durationMs = Math.max(0, at - since);
    }
    this.runningSince.delete(label);
    return this;
  }

  /** Marks every open "running" step as failed (used when the whole request errors out). */
  failOpenSteps(): this {
    for (const [label] of this.runningSince) this.fail(label);
    return this;
  }

  toJSON(): TimelineStep[] {
    return this._steps.map((s) => ({ ...s }));
  }
}
