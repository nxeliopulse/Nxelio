import "server-only";

/**
 * ============================================================================
 * Nxelio AI Security Layer
 * ============================================================================
 * The single enforcement point every AI feature passes through. Nothing here
 * trusts the model or the user: input is scanned before it reaches the LLM,
 * tool calls are permission-checked against the caller's role + nav overrides
 * before execution, and outputs are masked for secrets before they reach the
 * user.
 *
 * Design rules:
 * - FAIL CLOSED: any detection error → treat as blocked, never as allowed.
 * - Heuristic + deterministic: no LLM-in-the-loop for security decisions.
 * - Cheap: runs on every message, so it must be pure string/regex work.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 1. Prompt injection detection
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate an attempt to override the assistant's instructions,
 * exfiltrate the system prompt, or make the model act outside its role.
 * Each entry: { pattern, label } — label is used in audit logs.
 */
const INJECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Direct instruction-override attempts
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|messages?)/i, label: "instruction_override" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|messages?)/i, label: "instruction_override" },
  { pattern: /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|messages?)/i, label: "instruction_override" },
  { pattern: /forget\s+(all\s+)?(?:your|the)\s+(?:rules|instructions?|prompts?|guidelines|security|safety|filters?)/i, label: "instruction_override" },
  { pattern: /ignore\s+(?:all\s+)?(?:your|the\s+)?(?:security|rules|safety|filters?|guidelines|constraints|restrictions|prompt)/i, label: "instruction_override" },
  { pattern: /(?:you\s+are|act\s+as|pretend\s+to\s+be)\s+(?:now\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|uncensored|jailbroken|developer\s+mode|DAN|sudo)\b/i, label: "role_override" },
  { pattern: /(?:from\s+now\s+on|from\s+now|starting\s+now)\s+(?:you|we)\s+are\s+(?:now\s+)?(?:chatgpt|claude|gemini|gpt-?\d*|bard|llama|dan|an?\s+unrestricted|not\s+(?:the|my)\s+assistant)/i, label: "role_override" },
  { pattern: /pretend\s+(?:that\s+)?(?:you\s+are\s+)?no\s+longer\s+(?:the\s+)?(?:n?xelio|assistant|bot|ai)/i, label: "role_override" },
  { pattern: /\bDAN\b|\bdo\s+anything\s+now\b|\bjailbreak\b/i, label: "jailbreak" },
  { pattern: /(?:reveal|show|print|output|display|leak)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?|system\s+message)/i, label: "prompt_exfiltration" },
  { pattern: /(?:reveal|show|print|output|display|leak)\s+(?:your|the)\s+(?:hidden|secret|internal|full|complete|original|actual)\s+(?:system\s+)?(?:prompt|instructions?|rules?|messages?)/i, label: "prompt_exfiltration" },
  { pattern: /what(?:'s| is| are)\s+your\s+(?:system\s+)?(?:prompt|instructions?|rules?|messages?)/i, label: "prompt_exfiltration" },
  { pattern: /repeat\s+(?:everything|all|the\s+above|the\s+(?:system\s+)?prompt|your\s+(?:instructions?|system\s+prompt))\s+(?:above|before|verbatim|exactly|word\s+for\s+word)/i, label: "prompt_exfiltration" },
  { pattern: /(?:print|show|reveal|give|share|send|tell)\s+(?:me\s+)?(?:your|the)\s+(?:api\s+)?(?:keys?|secrets?|tokens?|passwords?|credentials?|private\s+key)/i, label: "secret_exfiltration" },
  { pattern: /(?:pretend|imagine|act)\s+.*(?:no\s+(?:rules|restrictions|limits|filters)|without\s+(?:rules|restrictions|limits|filters))/i, label: "constraint_bypass" },
  { pattern: /(?:you\s+are|now\s+you\s+are)\s+(?:my\s+)?(?:boss|admin|god|master|owner)\b/i, label: "authority_override" },
  { pattern: /(?:system|developer)\s*(?:message|prompt|instruction)s?\s*[:=]/i, label: "fake_system_message" },
  { pattern: /<\|?(?:system|im_start|im_end|endoftext|assistant|user)\|?>/i, label: "token_injection" },
  { pattern: /(?:nevermind|forget\s+(?:everything|all\s+of\s+it|it)|ignore\s+that)\s+(?:instead|but\s+now)/i, label: "context_switch" },
  // Data exfiltration framing
  { pattern: /(?:output|return|print|display|send|email|post)\s+(?:me|us)?\s*(?:all|every|the\s+entire|the\s+full)\s+(?:data|database|leads?|contacts?|users?|records?|list)/i, label: "bulk_exfiltration" },
  { pattern: /(?:export|dump|copy|extract)\s+(?:all|every|the\s+entire|the\s+full)\s+(?:data|database|leads?|contacts?|users?|records?|list)/i, label: "bulk_exfiltration" },
  // SQL injection signatures (single-quote OR/AND with comment terminator)
  { pattern: /(?:['"]\s*(?:or|and)\s+\d+\s*=\s*\d+\s*(?:--|#|\/\*))|(?:['"]\s*(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i, label: "sqli_attempt" },
  // XSS payloads — sanitized (stripped) so partially-malicious pasted HTML can't inject
  { pattern: /<script[\s>]|<\/script\s*>|onerror\s*=\s*["']?[^"'\s>]+|javascript\s*:\s*(?:alert|document\.|window\.|fetch\s*\()/i, label: "xss_attempt" },
];

/** Result of scanning a single user message. */
export interface PromptScanResult {
  /** true when the message must be blocked entirely (no LLM call). */
  blocked: boolean;
  /** true when the message should be sanitized but can still proceed. */
  sanitized: boolean;
  /** Which rules fired (labels) — for audit logging. */
  flags: string[];
  /** The (possibly sanitized) text to send to the model. */
  safeText: string;
}

/**
 * Scans one user message for prompt-injection / jailbreak attempts.
 * FAIL CLOSED: a message that trips a high-confidence pattern is blocked
 * outright; lower-confidence patterns sanitize the offending text out.
 */
export function scanPrompt(raw: string): PromptScanResult {
  const flags: string[] = [];
  let text = raw;

  for (const { pattern, label } of INJECTION_PATTERNS) {
    // Loop until no more occurrences (non-global patterns match one span per pass).
    while (pattern.test(text)) {
      flags.push(label);
      // Remove the offending span so a partially-malicious message can still
      // be answered safely instead of refusing the whole conversation.
      text = text.replace(pattern, " ");
    }
  }

  // Control characters / zero-width / homoglyph tricks used to smuggle
  // instructions past filters.
  const controlChars = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, "");
  if (controlChars !== text) {
    flags.push("control_chars");
    text = controlChars;
  }

  const blocked = flags.some((f) => BLOCK_ON_FLAG.has(f));
  return { blocked, sanitized: flags.length > 0 && !blocked, flags: [...new Set(flags)], safeText: text.trim() };
}

/** Flags severe enough to block the whole message (vs. sanitize-and-continue). */
const BLOCK_ON_FLAG = new Set([
  "instruction_override",
  "role_override",
  "jailbreak",
  "prompt_exfiltration",
  "secret_exfiltration",
  "fake_system_message",
  "token_injection",
  "authority_override",
  "bulk_exfiltration",
  "sqli_attempt",
]);

// ---------------------------------------------------------------------------
// 2. Secret detection & sensitive-data masking
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(?:sk-|pk-)[A-Za-z0-9-]{12,}\b/i, label: "openai_key" },
  { pattern: /\b(?:sk|pk|rk|ak|whsec|ghp|gho|github_pat|xox[baprs]|xoxp|slack)\b[-_][A-Za-z0-9-]{16,}\b/i, label: "api_key" },
  { pattern: /\b(?:AIza|ya29|SG\.|AC[a-z0-9]{32}|xox[baprs]-)[A-Za-z0-9_\-]{10,}\b/i, label: "api_key" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/i, label: "jwt" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/i, label: "aws_access_key" },
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i, label: "private_key" },
  { pattern: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^\s"']{6,}/i, label: "credential_assignment" },
  { pattern: /\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/i, label: "card_number" },
];

const MASK = "[REDACTED]";

/** Finds secrets in a string. Returns the labels found (for audit) and the masked text. */
export function detectSecrets(text: string): { flags: string[]; masked: string } {
  const flags: string[] = [];
  let masked = text;
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(masked)) {
      flags.push(label);
      masked = masked.replace(pattern, MASK);
    }
  }
  return { flags, masked };
}

/** Masks secrets in an AI reply before it reaches the user. */
export function maskSensitiveData(text: string): string {
  return detectSecrets(text).masked;
}

// ---------------------------------------------------------------------------
// 3. Tool permission validation (RBAC + per-user nav overrides)
// ---------------------------------------------------------------------------

export type AiRoleName = "Super Admin" | "Sales Admin" | "Marketing Admin";

export interface AiCallerContext {
  /** role_id from workspace_members (this workspace's role for the caller). */
  roleId: number | null;
  /** role name resolved from role_id — falls back to a safe default. */
  roleName: AiRoleName | null;
  /** per-user nav_access overrides ({ "/leads": false, ... }). */
  navAccess?: Record<string, boolean> | null;
}

/**
 * Which app domain (nav href) each AI tool belongs to, and which roles may
 * use it. Mirrors nav-config.ts role defaults so the AI can never do more
 * than the user could do in the UI.
 *
 * Exported (Phase 1) so the tool registry can DERIVE its descriptive
 * requiredPermissions from this single source — enforcement stays here.
 */
export const TOOL_DOMAINS: Record<string, { href: string; roles: AiRoleName[] }> = {
  // READ tools
  get_workspace_stats: { href: "/dashboard", roles: ["Super Admin", "Sales Admin", "Marketing Admin"] },
  list_users: { href: "/users", roles: ["Super Admin"] },
  search_leads: { href: "/leads", roles: ["Super Admin", "Sales Admin"] },
  list_campaigns: { href: "/campaigns", roles: ["Super Admin", "Sales Admin"] },
  list_segments: { href: "/segments", roles: ["Super Admin", "Marketing Admin"] },
  list_templates: { href: "/templates", roles: ["Super Admin", "Sales Admin", "Marketing Admin"] },
  list_newsletters: { href: "/newsletters", roles: ["Super Admin", "Marketing Admin"] },
  // WRITE tools
  create_lead: { href: "/leads", roles: ["Super Admin", "Sales Admin"] },
  update_lead: { href: "/leads", roles: ["Super Admin", "Sales Admin"] },
  create_campaign: { href: "/campaigns", roles: ["Super Admin", "Sales Admin"] },
  update_campaign: { href: "/campaigns", roles: ["Super Admin", "Sales Admin"] },
  create_segment: { href: "/segments", roles: ["Super Admin", "Marketing Admin"] },
  create_email_template: { href: "/templates", roles: ["Super Admin", "Sales Admin", "Marketing Admin"] },
  send_email_to_lead: { href: "/leads", roles: ["Super Admin", "Sales Admin"] },
  send_newsletter: { href: "/newsletters", roles: ["Super Admin", "Marketing Admin"] },
  send_contact_email: { href: "/settings", roles: ["Super Admin", "Sales Admin", "Marketing Admin"] },
  // UI actions (Phase 2) — navigation/modals only; nothing mutates until the
  // user clicks Save in the real UI, so every role may emit them.
  ui_action: { href: "/dashboard", roles: ["Super Admin", "Sales Admin", "Marketing Admin"] },
};

export interface ToolPermissionResult {
  allowed: boolean;
  /** Why it was denied — for the audit log and the user-facing message. */
  reason?: string;
}

/**
 * Validates that the caller's role + nav overrides permit this AI tool.
 * Mirrors isNavItemAllowed() from nav-config: role default, overridden by
 * navAccess[href] when present. FAIL CLOSED: unknown tool or unknown role →
 * denied.
 */
export function validateToolPermission(tool: string, ctx: AiCallerContext): ToolPermissionResult {
  const domain = TOOL_DOMAINS[tool];
  if (!domain) {
    return { allowed: false, reason: `Tool "${tool}" is not registered in the security layer.` };
  }

  // Per-user override wins (same semantics as the sidebar).
  const override = ctx.navAccess && Object.prototype.hasOwnProperty.call(ctx.navAccess, domain.href)
    ? ctx.navAccess[domain.href]
    : undefined;
  if (override === false) {
    return { allowed: false, reason: `Your role doesn't have access to ${domain.href} in this workspace.` };
  }
  if (override === true) return { allowed: true };

  if (!ctx.roleName) {
    return { allowed: false, reason: "Could not resolve your role — access denied." };
  }
  if (!domain.roles.includes(ctx.roleName)) {
    return { allowed: false, reason: `Your role (${ctx.roleName}) can't use this tool in this workspace.` };
  }
  return { allowed: true };
}

/** All tools the caller may use — used to filter the tool list sent to the model. */
export function allowedToolsFor(ctx: AiCallerContext): string[] {
  return Object.keys(TOOL_DOMAINS).filter((t) => validateToolPermission(t, ctx).allowed);
}

// ---------------------------------------------------------------------------
// 4. Rate limiting (per-user, in-memory sliding window)
// ---------------------------------------------------------------------------

interface RateBucket {
  timestamps: number[];
}

const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  assistant: { windowMs: 60_000, max: 20 }, // 20 messages / minute
  landing: { windowMs: 60_000, max: 10 },   // 10 messages / minute (unauthenticated)
  support: { windowMs: 60_000, max: 20 },
  // Each request can enrich up to 25 leads via a paid external search + AI
  // call — capped low since the per-request batch size already does most of
  // the work; this just stops looping the endpoint to blow past that cap.
  findCompaniesBulk: { windowMs: 60_000, max: 5 },
  // Nominatim's usage policy caps external callers at ~1 request/second for
  // the WHOLE app (not per user) — heavier automated use risks Nominatim
  // blocking our server's IP entirely. Called with one fixed key regardless
  // of caller, so this is a true app-wide gate, not a per-user one.
  geoLookup: { windowMs: 1_000, max: 1 },
};

const buckets = new Map<string, RateBucket>();

/**
 * Sliding-window rate limiter keyed by caller id (user id or IP).
 * In-memory is fine for a single-instance deployment; swap for Redis/Upstash
 * when scaling horizontally. FAIL CLOSED on error.
 */
export function rateLimit(key: string, scope: keyof typeof RATE_LIMITS): { allowed: boolean; retryAfterMs: number } {
  const cfg = RATE_LIMITS[scope];
  if (!cfg) return { allowed: false, retryAfterMs: 60_000 };

  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Drop timestamps outside the window.
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < cfg.windowMs);

  if (bucket.timestamps.length >= cfg.max) {
    const oldest = bucket.timestamps[0];
    return { allowed: false, retryAfterMs: Math.max(0, cfg.windowMs - (now - oldest)) };
  }
  bucket.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

/** Periodic cleanup so the map doesn't grow unbounded. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60_000);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, 60_000).unref?.();