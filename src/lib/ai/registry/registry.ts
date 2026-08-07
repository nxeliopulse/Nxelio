/**
 * ============================================================================
 * Phase 1 — Tool Registry
 * ============================================================================
 * Single source of truth for every AI tool: registration (with consistency
 * guards), lookup, and schema projection for the model. Permission filtering
 * delegates to security.validateToolPermission — the registry never grants,
 * it only surfaces what the security layer allows.
 * ============================================================================
 */
import type {
  ToolDefinition,
  ToolHandler,
  ToolParam,
} from "@/lib/ai/registry/types";
import { ToolError } from "@/lib/ai/executor/errors";
import { validateToolPermission, type AiCallerContext } from "@/lib/ai/security";

const TOOL_ID_RE = /^[a-z][a-z0-9_]*$/;

/** Exact shape OpenAI expects in the tools[] argument of a chat completion. */
export interface OpenAiToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function jsonType(type: ToolParam["type"]): string {
  return type; // 1:1 — both dialects use string/number/boolean/object/array
}

function toJsonSchema(param: ToolParam): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: jsonType(param.type) };
  if (param.description) schema.description = param.description;
  if (param.enum) schema.enum = param.enum;
  if (param.type === "array" && param.arrayOf) {
    const items: Record<string, unknown> = { type: jsonType(param.arrayOf.type) };
    if (param.arrayOf.enum) items.enum = param.arrayOf.enum;
    if (param.arrayOf.type === "object" && param.arrayOf.itemFields) {
      items.properties = Object.fromEntries(
        Object.entries(param.arrayOf.itemFields).map(([k, p]) => [k, toJsonSchema(p)])
      );
      const required =
        param.arrayOf.requiredInItem ??
        Object.entries(param.arrayOf.itemFields)
          .filter(([, p]) => p.required)
          .map(([k]) => k);
      if (required.length > 0) items.required = required;
    }
    schema.items = items;
  }
  return schema;
}

function toOpenAiSchema(tool: ToolDefinition): OpenAiToolSchema {
  const properties: Record<string, unknown> = {};
  for (const p of tool.params) properties[p.key] = toJsonSchema(p);
  return {
    type: "function",
    function: {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required: tool.params.filter((p) => p.required).map((p) => p.key),
      },
    },
  };
}

export class ToolRegistry {
  private byId = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.byId.has(tool.id)) {
      throw new Error(`ToolRegistry: duplicate tool id "${tool.id}"`);
    }
    this.assertConsistent(tool);
    this.byId.set(tool.id, tool);
    return this;
  }

  registerAll(tools: ToolDefinition[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(id: string): ToolDefinition | undefined {
    return this.byId.get(id);
  }

  /** Like get() but throws a user-safe not_found error. */
  require(id: string): ToolDefinition {
    const tool = this.byId.get(id);
    if (!tool) throw ToolError.notFound(`Tool "${id}" is not registered.`);
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.byId.values()];
  }

  getHandler(id: string): ToolHandler | undefined {
    return this.byId.get(id)?.handler;
  }

  /**
   * Schema projection for the model call — only tools the caller may use.
   * The security layer is still re-checked at execution time (fail closed).
   */
  toOpenAiTools(ctx: AiCallerContext, toolIds?: ReadonlySet<string>): OpenAiToolSchema[] {
    return this.list()
      .filter((t) => !toolIds || toolIds.has(t.id))
      .filter((t) => validateToolPermission(t.id, ctx).allowed)
      .map(toOpenAiSchema);
  }

  /** App-level invariants — a tool that violates them is a code bug, not runtime data. */
  private assertConsistent(tool: ToolDefinition): void {
    if (!TOOL_ID_RE.test(tool.id)) {
      throw new Error(`ToolRegistry: id "${tool.id}" must be lowercase snake_case`);
    }
    if (tool.mode === "write" && !tool.approvalRequired) {
      throw new Error(`ToolRegistry: write tool "${tool.id}" must require approval`);
    }
    if (tool.mode === "read" && tool.approvalRequired) {
      throw new Error(`ToolRegistry: read tool "${tool.id}" must not require approval`);
    }
  }
}

/** Builds a pre-populated registry (convenience for one-shot setups). */
export function createRegistry(tools: ToolDefinition[]): ToolRegistry {
  return new ToolRegistry().registerAll(tools);
}
