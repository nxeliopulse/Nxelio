/**
 * ============================================================================
 * Phase 1 — Argument Validation
 * ============================================================================
 * Validates model-provided arguments against a ToolDefinition's param rules
 * BEFORE the handler runs. Produces plain, user-safe error lists. Unknown
 * extra keys are ignored (forward-compatible), required keys are strict.
 * ============================================================================
 */
import type { ParamType, ToolDefinition, ToolParam } from "@/lib/ai/registry/types";
import { ToolError } from "@/lib/ai/executor/errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\/\S+$/i;

function matchesType(value: unknown, type: ParamType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
  }
}

function validateValue(path: string, param: ToolParam, value: unknown): string[] {
  const errors: string[] = [];
  if (!matchesType(value, param.type)) {
    errors.push(`${path} must be a ${param.type}`);
    return errors; // no cascading checks on a wrong type
  }

  if (typeof value === "string") {
    if (param.enum && !param.enum.includes(value)) {
      errors.push(`${path} must be one of: ${param.enum.join(", ")}`);
    }
    if (param.format === "email" && !EMAIL_RE.test(value)) {
      errors.push(`${path} must be a valid email address`);
    }
    if (param.format === "uuid" && !UUID_RE.test(value)) {
      errors.push(`${path} must be a valid id`);
    }
    if (param.format === "url" && !URL_RE.test(value)) {
      errors.push(`${path} must be a valid URL`);
    }
    if (param.minLength !== undefined && value.length < param.minLength) {
      errors.push(`${path} must be at least ${param.minLength} characters`);
    }
    if (param.maxLength !== undefined && value.length > param.maxLength) {
      errors.push(`${path} must be at most ${param.maxLength} characters`);
    }
  }

  if (param.type === "array" && param.arrayOf) {
    const arrayOf = param.arrayOf; // hoisted so closure narrowing survives
    const items = value as unknown[];
    items.forEach((item, i) => {
      const itemPath = `${path}[${i}]`;
      if (!matchesType(item, arrayOf.type)) {
        errors.push(`${itemPath} must be a ${arrayOf.type}`);
        return;
      }
      if (typeof item === "string" && arrayOf.enum && !arrayOf.enum.includes(item)) {
        errors.push(`${itemPath} must be one of: ${arrayOf.enum.join(", ")}`);
      }
      if (arrayOf.type === "object" && item !== null && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const req of arrayOf.requiredInItem ?? []) {
          if (obj[req] === undefined) errors.push(`${itemPath}.${req} is required`);
        }
        if (arrayOf.itemFields) {
          for (const [fieldKey, fieldParam] of Object.entries(arrayOf.itemFields)) {
            const fieldValue = obj[fieldKey];
            if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
              if (fieldParam.required) errors.push(`${itemPath}.${fieldKey} is required`);
            } else {
              errors.push(...validateValue(`${itemPath}.${fieldKey}`, fieldParam, fieldValue));
            }
          }
        }
      }
    });
  }

  return errors;
}

export type ValidationResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validates raw model arguments against the tool's param list.
 * Returns sanitized args (defaults applied) on success, or a list of
 * user-safe error messages. Never throws — caller decides the response.
 */
export function validateArgs(tool: ToolDefinition, raw: unknown): ValidationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [`${tool.id}: arguments must be an object`] };
  }
  const args = { ...(raw as Record<string, unknown>) };
  const errors: string[] = [];

  for (const param of tool.params) {
    const value = args[param.key];
    if (value === undefined || value === null || value === "") {
      if (param.required) {
        errors.push(`"${param.key}" is required`);
      } else if (param.default !== undefined) {
        args[param.key] = param.default;
      }
      continue;
    }
    errors.push(...validateValue(`"${param.key}"`, param, value));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, args };
}

/** Convenience: validates and throws a user-safe ToolError (used by the executor). */
export function throwIfInvalid(tool: ToolDefinition, raw: unknown): Record<string, unknown> {
  const result = validateArgs(tool, raw);
  if (!result.ok) throw ToolError.validation(`${tool.id}: ${result.errors.join("; ")}`);
  return result.args;
}
