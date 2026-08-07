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
  private runningSince = new Map<string, number[]>();

  get steps(): readonly TimelineStep[] {
    return this._steps;
  }

  /** Adds a step. Use status "running" to start timing; complete()/fail() to close it. */
  add(label: string, status: TimelineStatus = "done", at = Date.now()): this {
    const step: TimelineStep = { label, status, at };
    if (status === "running") {
      const starts = this.runningSince.get(label) ?? [];
      starts.push(at);
      this.runningSince.set(label, starts);
    }
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
    // Close the most recent still-running step. Several parallel planner
    // steps may share a human label, so closing the first match is incorrect.
    let step: TimelineStep | undefined;
    for (let i = this._steps.length - 1; i >= 0; i--) {
      if (this._steps[i].label === label && this._steps[i].status === "running") {
        step = this._steps[i];
        break;
      }
    }
    const starts = this.runningSince.get(label) ?? [];
    const since = starts.pop();
    if (step) {
      step.status = status;
      step.at = at;
      if (since !== undefined) step.durationMs = Math.max(0, at - since);
    }
    if (starts.length === 0) this.runningSince.delete(label);
    else this.runningSince.set(label, starts);
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
