/**
 * ============================================================================
 * Phase 1 — Universal Tool Registry: shared types
 * ============================================================================
 * Every AI capability is described by a ToolDefinition. The registry, executor,
 * validator, timeline, streaming, health, rollback, and response formatter all
 * consume these types. The security layer (security.ts) remains the single
 * enforcement point — metadata here is descriptive, never authoritative.
 * ============================================================================
 */
import type { AiCallerContext, AiRoleName } from "@/lib/ai/security";

/** Read = auto-executed when proposed; Write = queued for approval first. */
export type ToolMode = "read" | "write";

export type ToolCategory =
  | "analytics"   // workspace stats, reports
  | "people"      // users, team, roles
  | "leads"       // lead search / creation / updates
  | "campaigns"   // email campaigns
  | "segments"    // audience segments
  | "templates"   // reusable email templates
  | "newsletters" // newsletters
  | "communication" // sending emails / contacting the team
  | "memory" // persistent workspace and user preferences
  | "proactive" // proactive risk signals and recommendations
  | "ui"; // Phase 2 — UI actions (navigate / open pre-filled forms)

export type ParamType = "string" | "number" | "boolean" | "object" | "array";

/** One parameter of a tool — validation rules + model-facing description. */
export interface ToolParam {
  key: string;
  type: ParamType;
  /** Omit only where the original pre-Phase-1 schema had no description. */
  description?: string;
  required: boolean;
  /** Closed set of valid string values (rendered as enum in OpenAI schema). */
  enum?: string[];
  /** Structured string checks. */
  format?: "email" | "uuid" | "url";
  minLength?: number;
  maxLength?: number;
  /** For array params: element shape (mirrors create_segment rules today). */
  arrayOf?: {
    type: ParamType;
    enum?: string[];
    requiredInItem?: string[];
    itemFields?: Record<string, ToolParam>;
  };
  default?: unknown;
}

/** Descriptive output shape — used by tools/health/admin surfaces, not enforced at runtime. */
export interface ToolOutputSchema {
  type: "object";
  description: string;
  properties: Record<string, { type: string; description?: string }>;
}

export interface ToolExecutionCost {
  /** Extra credits per execution on top of the 1/message assistant charge. 0 for all current tools. */
  credits: number;
  notes?: string;
}

/** Undo hook returned by a handler after a successful write (see RollbackManager). */
export interface ToolUndo {
  describe: string;
  run: () => Promise<string>;
}

/** What a handler returns. Reads: detail = JSON string the model sees (unchanged behavior). */
export interface ToolResult {
  ok: boolean;
  detail: string;
  data?: unknown;
  undo?: ToolUndo;
}

export interface ToolExecutionContext {
  callerCtx: AiCallerContext;
  requesterEmail?: string | null;
  executionId: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<ToolResult>;

/** The single, standardized description of one tool. */
export interface ToolDefinition {
  /** snake_case unique id — same as the function name the model calls. */
  id: string;
  /** Human label, e.g. "Create Lead". */
  name: string;
  /** Model-facing description (kept byte-identical to pre-Phase-1 text). */
  description: string;
  /** Metadata: when the assistant should reach for this tool. */
  whenToUse?: string;
  /** Metadata: when the assistant should NOT use it. */
  whenNotToUse?: string;
  category: ToolCategory;
  mode: ToolMode;
  approvalRequired: boolean;
  /** Descriptive only — runtime enforcement stays in security.ts (validateToolPermission). */
  requiredPermissions: { roles: AiRoleName[]; href: string };
  params: ToolParam[];
  outputSchema: ToolOutputSchema;
  example: { args: Record<string, unknown>; description: string };
  estimatedCost: ToolExecutionCost;
  /** Rough expected execution time in ms (metadata for the assistant/admin surfaces). */
  estimatedMs: number;
  /** Progress label shown during execution, e.g. "Searching leads...". */
  progressLabel?: string;
  handler: ToolHandler;
  /** Short human summary for the approval card. */
  summarize?: (args: Record<string, unknown>) => string;
}

/** Execution states — the only valid lifecycle: pending → running → success|failed. */
export type ExecutionStatus = "pending" | "running" | "success" | "failed";

export interface ToolExecutionRecord {
  executionId: string;
  toolId: string;
  status: ExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  /** Auto-retry attempts made (reads only — writes never auto-retry). */
  attempts: number;
  error?: { code: string; message: string; retryable: boolean };
  result?: ToolResult;
}

export type TimelineStatus = "pending" | "running" | "done" | "failed";

export interface TimelineStep {
  label: string;
  status: TimelineStatus;
  at: number;
  durationMs?: number;
}

/** Streaming phases — maps to the public progress transcript. */
export type ProgressPhase =
  | "understanding"
  | "planning"
  | "searching"
  | "generating"
  | "approval"
  | "finished"
  | "tool";

export interface ProgressEvent {
  phase: ProgressPhase;
  label: string;
  status: TimelineStatus;
  at: number;
}
