/**
 * ============================================================================
 * Phase 1 — Streaming / Progress
 * ============================================================================
 * Emits ProgressEvents as the assistant moves through phases
 * (understanding → planning → searching → approval → generating → finished,
 * plus "tool" while a specific tool runs). Also keeps a plain-text transcript
 * for the UI and for the final structured response. Pure and testable.
 * ============================================================================
 */
import type { ProgressEvent, ProgressPhase, TimelineStatus } from "@/lib/ai/registry/types";

export type ProgressCallback = (event: ProgressEvent) => void;

export class StreamingManager {
  private _transcript: string[] = [];
  private last: { phase: ProgressPhase; label: string } | null = null;

  constructor(private readonly onProgress?: ProgressCallback) {}

  /** Starts a phase — emits a "running" event. */
  begin(phase: ProgressPhase, label: string): void {
    this.last = { phase, label };
    this.emit(phase, label, "running");
  }

  /** Closes the current phase as done (optionally with a different label). */
  done(label?: string): void {
    this.finish("done", label);
  }

  /** Closes the current phase as failed (optionally with a different label). */
  fail(label?: string): void {
    this.finish("failed", label);
  }

  /** Full transcript of completed steps, e.g. ["✓ Read workspace stats", "✓ Search leads"]. */
  get transcript(): readonly string[] {
    return this._transcript;
  }

  private finish(status: "done" | "failed", label?: string): void {
    if (!this.last) return;
    this.emit(this.last.phase, label ?? this.last.label, status);
  }

  private emit(phase: ProgressPhase, label: string, status: TimelineStatus): void {
    const event: ProgressEvent = { phase, label, status, at: Date.now() };
    this.onProgress?.(event);
    if (status !== "running") {
      this._transcript.push(`${status === "done" ? "✓" : "✗"} ${label}`);
    }
  }
}
