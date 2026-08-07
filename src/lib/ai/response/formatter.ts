/**
 * ============================================================================
 * Phase 1 — Structured Response Formatter
 * ============================================================================
 * Assembles the final structured answer from execution artifacts
 * (timeline, transcript, results, warnings). The UI contract stays exactly
 * as before — AssistantResult { reply, actions, proposal?, choices?, error? }
 * — this module just gives runAssistant a consistent shape to build from.
 * ============================================================================
 */
import type { TimelineStep } from "@/lib/ai/registry/types";

export interface FormattedResponse {
  /** One-line human summary, e.g. "Created lead Alex Chen and queued approval." */
  summary: string;
  /** Bullet-friendly list of what actually ran (feeds AssistantResult.actions). */
  actionsPerformed: string[];
  /** Markdown block with tool result details the model may reuse. */
  results: string;
  /** Issues that didn't block completion (e.g. "1 tool was skipped"). */
  warnings: string[];
  /** Suggested next steps for the user to keep momentum. */
  nextSuggestedActions: string[];
  /** Timeline snapshot (for debugging / future UI timeline). */
  timeline: TimelineStep[];
  /** Plain-text progress transcript (already includes ✓/↩ marks). */
  transcript: string[];
}

export function formatResponse(parts: Partial<FormattedResponse>): FormattedResponse {
  return {
    summary: parts.summary ?? "",
    actionsPerformed: parts.actionsPerformed ?? [],
    results: parts.results ?? "",
    warnings: parts.warnings ?? [],
    nextSuggestedActions: parts.nextSuggestedActions ?? [],
    timeline: parts.timeline ?? [],
    transcript: parts.transcript ?? [],
  };
}

/** Renders a FormattedResponse into the final markdown reply for the UI. */
export function renderReply(f: FormattedResponse): string {
  const chunks: string[] = [];
  if (f.summary) chunks.push(f.summary);
  if (f.actionsPerformed.length > 0) {
    chunks.push("", "**What I did:**", ...f.actionsPerformed.map((a) => `- ${a}`));
  }
  if (f.results) chunks.push("", f.results);
  if (f.warnings.length > 0) {
    chunks.push("", "**Heads-up:**", ...f.warnings.map((w) => `- ${w}`));
  }
  if (f.nextSuggestedActions.length > 0) {
    chunks.push("", "**You could also try:**", ...f.nextSuggestedActions.map((s) => `- ${s}`));
  }
  return chunks.join("\n").trim();
}
