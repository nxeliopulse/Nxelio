# Nxelio Nurture — AI Phase Roadmap & Progress Tracker

> **How to use this file (read this first):**
> - Update it **at the END of every phase** (or when any phase status changes).
> - Move completed items from "Remaining" → "Completed" with **verification evidence** (test result, command, browser check).
> - Keep bullets terse. Never delete historical entries — add a new dated line.
> - Companion stores: session/change log = `~/.config/opencode/improver/changelog.md`, durable learnings = `~/.config/opencode/improver/knowledge.md`, project-local adaptations = `.opencode/improver/project-notes.md`.
> - Master plan validated by user on **2026-08-05**.

## Build order (user-validated)
Phase 0 → Phase 1 → **Phase 3 (Intent Planner) BEFORE Phase 2 (UI Controller)** — planning drives UI automation → Phase 2 → Phase 4 → Phases 5 + 6 → Phases 7–12.

## Overall status

| Phase | Status | Progress | Last updated |
|---|---:|---|---:|
| 0 – Security | ✅ Complete | 100% | 2026-08-05 |
| 1 – Universal Assistant | ✅ Near-complete | ~95% | 2026-08-05 |
| 2 – UI Controller | 🚧 In progress | ~5% | 2026-08-05 |
| 3 – Intent Planner | ❌ Not started | 0% | 2026-08-05 |
| 4 – Multi-Agent | ❌ Not started | 0% | 2026-08-05 |
| 5 – Workspace Memory | ⚠️ Partial | 35% | 2026-08-05 |
| 6 – Autonomous AI | ❌ Not started | 0% | 2026-08-05 |
| 7 – AI Dashboard | ❌ Not started | 0% | 2026-08-05 |
| 8 – Contextual AI | ⚠️ Partial | 20% | 2026-08-05 |
| 9 – NL CRM | ⚠️ Partial | 30–40% | 2026-08-05 |
| 10 – AI OS | ❌ Not started | 0% | 2026-08-05 |
| 11 – Compliance | ❌ Not started | 0% | 2026-08-05 |
| 12 – AI Red Team | ❌ Not started | 0% | 2026-08-05 |

---

## Phase 0 — Enterprise AI Security
**Status: ✅ Complete (100%) — verified 2026-08-05**

Completed (all with evidence):
- AI security layer `src/lib/ai/security.ts`: prompt-injection scan, jailbreak detection, secret detection + masking, tool permission validation, RBAC + `nav_access` enforcement
- Tool filtering before LLM (permission-projected tool list) + runtime permission re-validation at execution AND at approval time ("approval re-validation" ✅)
- Read-tool audit logging, secret masking in AI replies, full AI audit trail (`src/lib/ai/audit.ts`), rate-limiting engine (`rateLimit`)
- Rate limiting wired into **Landing Chat (per visitor IP)** AND **Support Bot (per user + `auditRateLimited`)** ✅ (verified in `landing-chat.ts`, `support.ts`)
- Delete protection, anti-hallucination guard, approval workflow (pre-existing, re-verified)
- Verification: `phase0-suite.mjs` **51/51 PASS** (20 categories: auth, RBAC, injection, secrets, hallucination, RLS, tool perms, approval, rate limit, audit, leakage, SQLi, XSS, CSRF, jailbreak, multi-turn, tool visibility, runtime perm change, performance, acceptance) + 8/8 browser tests; `tsc` clean, `npm run build` clean

Remaining: none per roadmap. Keep suite green on future changes.

---

## Phase 1 — Universal AI Assistant
**Status: ✅ Near-complete (~95%) — verified 2026-08-05**

Completed:
- **Universal tool registry** ✅ `src/lib/ai/registry/{types,validator,registry}.ts` — `ToolDefinition` metadata (params, permissions, mode, summarize, undo), `createRegistry().toOpenAiTools(ctx)` permission-filtered projection, arg validation
- **Execution engine** ✅ `src/lib/ai/executor/executor.ts` — single path: permission → validation → handler → health/timeline/stream/record; reads auto-retry once, writes never retry; `ToolError` normalization
- **Streaming tool execution** ✅ `src/lib/ai/executor/streaming.ts` — per-request `transcript` + `progressLabel`
- **Execution timeline** ✅ `src/lib/ai/executor/timeline.ts` — `TimelineStep[]` returned on `AssistantResult.timeline`
- **Undo/rollback** ✅ `src/lib/ai/executor/rollback.ts` + `RollbackManager` — undo hooks on creates, cleared after approval
- **16 tools extracted** ✅ `src/lib/ai/tools/index.ts` (7 reads + 9 writes, byte-identical descriptions) + `response/formatter.ts`
- **assistant.ts refactored** to registry/executor; `security.ts` exports `TOOL_DOMAINS`
- **Campaign steps feature** ✅ `update_campaign` `steps` param (append-only, auto Day-N numbering, same "Day N — Subject\nBody" + `---` block format as the Sequence tab)
- Verification: tsc clean, build clean, suite **51/51**, browser E2E all PASS (read via executor, lead wizard, create campaign → approval → persisted, **append 2 steps → 3-step sequence in UI**)

Remaining:
- Tool status UI polish (progress chips in chat; progress labels exist on approval cards)
- Optional: full sequence remove/reorder via AI (needs `list_campaigns` to expose content or a `get_campaign_steps` read tool)

---

## Phase 2 — AI UI Controller
**Status: ❌ Not started**

Needs (from roadmap): UI Action Registry, page navigation, button clicking, form filling, table filtering, modal opening, file uploading, UI automation engine.

Note: build AFTER Phase 3 (Intent Planner) per user's validated order.

---

## Phase 3 — Intent Planner
**Status: IN PROGRESS (started 2026-08-06) — M1 code COMPLETE ✅, browser E2E pending (user-managed)**

### M1 status (2026-08-06)
- **Code**: `src/lib/ai/planner/{types,planner,executor}.ts` + `assistant.ts` hook (`runIntentPlanner`, runs pre-LLM after wizard/security gates).
  - Planner: deterministic `decomposeIntent` (no LLM) — W1 nurture-email (search_leads → send_email_to_lead via `$ref`), W2 segment-new (search_leads → create_segment); write steps auto-flagged `requires_approval`.
  - Executor: dependency-ordered, `$ref` output chaining (`$step.path`), retry w/ backoff (reads 2×, writes 1×), per-step statuses, stop-on-fail + dependent-skip.
  - Integration: read steps run immediately via the real Phase 1 executor (permission/timeline/stream); write steps batch into ONE approval card with per-row expansion (one action per found lead); reply shows ✓/✗/– status lines; falls through to LLM when unmatched.
- **Verification**: planner smoke **17/17** (matchers, $ref chaining, ordering, retry, write-no-retry, skip-on-fail) · `tsc --noEmit` clean · `npm run build` clean (36.4s/17.4s).
- **Browser E2E (user)**: "send a follow-up email to my new leads with subject: … body: …" → search ✓ + one approval card per found lead; "create a segment of my qualified prospects" → search ✓ + segment approval card; no-match goals still hit the LLM.
- **M2 next**: per-step status chips in chat UI, continue-on-fail option, planner hints surfaced to the LLM for freeform intents.

Needs (from roadmap): intent decomposition, task planning, multi-step workflows, dependency graph, retry logic, workflow execution engine.

**Design (decided 2026-08-06)**: deterministic intent planner (matches the codebase pattern — no LLM for planning; LLM stays the tool-caller for freeform). A user goal is decomposed into an ordered plan of registry-validated tool steps (`depends_on` graph + `$ref` output chaining). Read steps run immediately; write steps batch into ONE approval card (existing multi-action proposal); after approval the engine executes write steps in dependency order with retry (reads 2× w/ backoff, writes 1×) and reports per-step status.

**M1 (vertical slice)**: planner types + 2 workflows (W1 nurture-email: search_leads → send_email_to_lead per row via $ref; W2 segment-new-leads: search_leads → create_segment) + plan executor (topological order, $ref resolution, retry, statuses, stop-on-fail) + assistant integration + smoke test + tsc/build.
**M2**: dependency visualization in chat (per-step status chips), continue-on-fail option, planner hints surfaced to LLM for freeform intents.
**M3**: LLM-assisted plan synthesis validated against the same engine (Phase 2 ui_actions can become plan steps).

---

## Phase 4 — Multi-Agent Architecture
**Status: ❌ Not started**

Needs: Sales Agent, Marketing Agent, Analytics Agent, Content Agent, Support Agent, Admin Agent, Agent Router, shared context.

---

## Phase 5 — Workspace Memory
**Status: ⚠️ Partial (35%)**

Already has: chat history.
Missing: long-term memory, user preferences, workspace preferences, AI learning, memory editor, memory expiration.

---

## Phase 6 — Autonomous AI
**Status: ❌ Not started**

Needs: background monitoring, recommendation engine, trigger detection, AI notifications, AI suggestions, approval before execution.

---

## Phase 7 — AI Dashboard
**Status: ❌ Not started**

Needs: morning brief, AI insights, KPI summaries, recommendations, weekly digest, AI-generated analytics.

---

## Phase 8 — Contextual AI
**Status: ⚠️ Partial (20%)**

Already has: main assistant only.
Missing: Lead AI, Campaign AI, Analytics AI, Email AI, Segment AI, context-aware page assistants.

---

## Phase 9 — Natural Language CRM
**Status: ⚠️ Partial (30–40%)**

Already has: Segment Builder (AI), lead "AI Actions" enrichment (prospects table).
Missing: universal NL search, NL filters, NL reports, NL analytics, NL CRUD, NL dashboard.

---

## Phase 10 — AI Operating System
**Status: ❌ Not started**

Needs: universal action graph, AI-first navigation, AI execution engine, workflow engine, cross-feature orchestration.

---

## Phase 11 — Enterprise Compliance
**Status: ❌ Not started**

Needs: GDPR, SOC2 readiness, ISO27001 readiness, data retention, data export, right to be forgotten, compliance dashboard.

---

## Phase 12 — AI Red Team
**Status: ❌ Not started**

Needs: prompt attack testing, jailbreak testing, tool abuse testing, permission escalation testing, cross-tenant testing, hallucination testing, AI security dashboard.

---

## Change history
- **2026-08-05** — File created. Phases 0 + 1 status verified from code + tests; roadmap validated by user; build order recorded.

## Phase 2 — AI UI Controller (IN PROGRESS — started 2026-08-05)

**Architecture (decided)**: "UI Action" pattern — assistant emits declarative actions (`{id, params}`) in replies; client executes them. No approval needed for navigate/modal-open (nothing mutates until user clicks Save); mutating flows still go through the existing approval cards. Model can only emit registry-defined actions (whitelisted targets).

**Layers**:
1. `src/lib/ui-actions/registry.ts` — action defs (id, name, description, params, kind: navigate|modal|filter, target)
2. `assistant.ts` — `uiAction` on message contract + `ui_action` tool (read-like, no approval)
3. `src/components/layout/ui-action-provider.tsx` — client executor (router.push for navigate, context event for modals); wired in app-shell
4. `assistant-widget.tsx` — renders "UI action" card + Execute button
5. Page consumers: leads-table (Add Prospect wizard prefill), campaigns pages — subscribe via context

**Milestones**: M1 navigate + lead-form modal vertical slice (browser-tested) → M2 filters + upload/import flows → M3 sequences (multi-action runs with status).

**Known follow-up**: deterministic lead wizard in chat currently intercepts "create a lead" phrasing — modal-open should take precedence for those intents (tie-in with Phase 3 Intent Planner).

### M1 status (2026-08-05) — COMPLETE ✅
- **Code**: registry (13 actions), security domain, ui_action tool (17 tools), assistant.ts intercept, UiActionProvider, app-shell wiring, widget UI-action card, wizard prefill (initialEntry), leads-table consumer.
- **Verification**: tsc clean · build clean · Phase 0 suite 51/51 · registry smoke **24/24** · tool smoke **26/26** · **browser E2E 22/22** (raw CDP driver, real Chrome on :9222 — no MCP needed):
  - T1 "Take me to my campaigns page" → card → Show me → /campaigns + ✓ Opened ✅
  - T2 "Open the new prospect form — … Alex Chen …" → card → Show me → /leads + wizard prefilled (name/email/company/job title) on Manual Entry ✅
  - T3 create prospect (LLM path) → approval card → Approve & run → **auto-navigates /leads** + ✓ Opened ✅
- **Post-feedback fixes (user-witnessed)**:
  - After approved `create_lead`, `approveAssistantActions` returns `uiAction: navigate_leads` (derived from registry) → widget auto-executes → user lands on Prospects page. Covers BOTH the LLM path and the deterministic lead wizard path.
  - Registry param **aliases** (`full_name→name`, `company_name→company`, `title→job_title`) — model emitted create_lead-style keys that were silently dropped; prefill was losing name/company. Canonical key wins over alias.
  - `ui_action` tool description forbids info-begging ("emit IMMEDIATELY with only details already provided — do NOT ask for missing info first").
- **E2E harness**: `/var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode/phase2-e2e-cdp.mts` — raw CDP via `ws://127.0.0.1:9222/devtools/browser/<id>` (Target.getTargets/createTarget/attachToTarget + Runtime.evaluate); waits for ENABLED buttons (streaming race); reloads page for a fresh chat. Login: real Super Admin account (user-provided); page reload wipes chat state.
- **Cleanup after E2E**: test leads (e2e.verify@test.com ×2) deleted via service-role PostgREST; unused qa.e2e@leadpro.ai auth user deleted; temp creds file removed.
- **M2** (filters/upload flows), **M3** (multi-action sequences): not started — M2 next.

### M2 deferred follow-up (2026-08-06, paused by user — see .opencode/improver/project-notes.md)
Status-picklist propagation + AI filter fixes are HALF-APPLIED (leads-table / lead-detail-view / registry edited; tools/index.ts NOT; unverified). Resume before Phase 3 M2+ or whenever user says "resume status work".
