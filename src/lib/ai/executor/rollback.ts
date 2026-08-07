/**
 * ============================================================================
 * Phase 1 — Rollback
 * ============================================================================
 * Collects undo hooks from successful write tools per execution and can
 * apply them (reverse order) — used when the user rejects a follow-up or a
 * workflow fails midway. Keyed by executionId so only the CURRENT request's
 * actions are ever undoable; nothing survives between requests.
 * ============================================================================
 */
import type { ToolUndo } from "@/lib/ai/registry/types";

export interface RollbackEntry {
  toolId: string;
  describe: string;
  undo: ToolUndo;
}

export class RollbackManager {
  private entries = new Map<string, RollbackEntry[]>();

  /** Registers an undo hook after a successful write tool execution. */
  record(executionId: string, toolId: string, undo: ToolUndo): void {
    const list = this.entries.get(executionId) ?? [];
    list.push({ toolId, describe: undo.describe, undo });
    this.entries.set(executionId, list);
  }

  /** Hooks recorded for this execution, newest first (application order). */
  list(executionId: string): RollbackEntry[] {
    return [...(this.entries.get(executionId) ?? [])].reverse();
  }

  /**
   * Applies all undo hooks for the execution, newest first. Each undo is
   * wrapped so one failure can't abort the rest. Returns one transcript
   * line per applied undo. The execution's hooks are dropped afterwards.
   */
  async apply(executionId: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of this.list(executionId)) {
      try {
        const result = await entry.undo.run();
        out.push(`↩ ${entry.describe} — ${result}`);
      } catch {
        out.push(`↩ ${entry.describe} — undo failed`);
      }
    }
    this.entries.delete(executionId);
    return out;
  }

  /** Drops hooks without applying them (e.g. workflow completed successfully). */
  clear(executionId: string): void {
    this.entries.delete(executionId);
  }
}
