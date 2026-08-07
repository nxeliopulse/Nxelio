# LeadPro / Nxelio Nurture — Project-Local Improver Notes

Project-specific adaptations, decisions, and gotchas that don't belong in global improver files.

- **Phase tracker (READ THIS FIRST when starting any phase)**: `docs/PHASE-ROADMAP.md` — per-phase status, completed items with evidence, remaining work, build order. Update it at the end of every phase.
- **Global stores**: `~/.config/opencode/improver/` — changelog.md (dated changes), knowledge.md (durable learnings), token-audit.md (token patterns).

## Project facts
- Stack: Next.js (custom version w/ breaking changes — read `node_modules/next/dist/docs/` before writing code), Supabase (env in `.env 2.local`), Tailwind, Chrome MCP for browser tests.
- Dev server: `npm run dev -- -p 3001` (wedges after ~2 days — SIGKILL + restart).
- AI assistant: `src/lib/ai/assistant.ts` (registry/executor architecture, Phase 1); landing-chat.ts + support.ts have their own security layers.
- Campaign email sequence = blocks in `campaigns.content`: `Day N — Subject\nBody` joined by `\n---\n` (parser in `campaign-detail-view.tsx:42`).
- Campaign hard-delete is AI-tool-only; UI offers Archive only. AI delete tools disabled by design.
- Test campaign "Q3 Product Launch" (id 36d5967d-dd88-4a30-85dd-bbc32cc21566, 3 steps, Draft) left in DB as demo — delete via script (createAdminClient + deleteCampaign) if user asks.
- MADAR: NOT installed, doesn't exist on npm — never re-attempt; use glob/grep.

## Browser test cheat sheet
- Textarea typing workaround: native value setter + input event + click Send (uid from snapshot).
- Suite: `cd /var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode && NODE_PATH=.../stub/node_modules npx --prefix /Users/apple/Desktop/LeadPro tsx phase0-suite.mjs` → expect 51/51.
- Page 21 in Chrome MCP = localhost:3001 (Super Admin, credits ~75/200).

## 2026-08-05 — Phase 2 (UI Controller) facts
- UI Action Registry: `src/lib/ui-actions/registry.ts` (13 actions: 12 navigate + open_lead_form modal). Tools now 17.
- E2E test phrasings: navigate → "Take me to my campaigns page"; modal → "Open the new prospect form — I want to add Alex Chen, alex.chen@acme-demo.com from Acme Demo Inc as Sales Manager" (AVOID word "lead" after create/add/new — wizard intercepts).
- Smoke test: `cd /var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode && npx --prefix /Users/apple/Desktop/LeadPro tsx phase2-registry-smoke.mts` → 18/18.
- Chrome MCP wedged 2026-08-05 (363% CPU) → killed; respawns next session from global config. If E2E needed now: restart opencode session.
- Tool-level smoke: `cd /var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode && NODE_PATH=/var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode/stub/node_modules npx --prefix /Users/apple/Desktop/LeadPro tsx --tsconfig /Users/apple/Desktop/LeadPro/tsconfig.json phase2-tool-smoke.mts` → 25/25. IMPORTANT: needs `--tsconfig <project>/tsconfig.json` for @/ alias (registry smoke doesn't need it; tools/index.ts does).
- navigate_campaigns label = "Go to Campaigns" (from registry name — client card shows this).

## 2026-08-06 — Phase 2 M1 DONE, E2E harness + cleanup
- E2E: `cd /var/folders/v0/vlj0n4z16xs0r8n2kp5xl__w0000gn/T/opencode && npx --prefix /Users/apple/Desktop/LeadPro tsx phase2-e2e-cdp.mts` → **22/22 PASS** (T1 navigate / T2 modal prefill / T3 create→approve→auto-navigate). Uses real Chrome CDP :9222 (no MCP needed); tab already logged in as Super Admin; reloads page for fresh chat.
- Post-approval navigation lives in `approveAssistantActions` (assistant.ts) + `approveProposal` (assistant-widget.tsx).
- Registry aliases in `src/lib/ui-actions/registry.ts` (open_lead_form: full_name→name, company_name→company, title→job_title).
- Cleanup done: test leads deleted, qa.e2e auth user deleted, temp creds file removed.
- NEXT: M2 — filters/upload UI-action flows (registry actions for filters + CSV import; wizard deep-links; E2E T4+).

## 2026-08-06 — PENDING (paused by user): status filter improvements
HALF-APPLIED — verify with tsc/build before touching anything else in these files.
- **Applied**: `leads-table.tsx` (statuses picklist state + statusFilter exact-match + Filter popover Status select now picklist-driven + quick pill row incl. Converted + StatusPill hash colors + pendingFilters handles converted/all/status), `lead-detail-view.tsx` (status dropdown picklist-driven, Win/Lost always appended), `registry.ts` (quick options += all/converted; new free-text `status` param; **resolveUiAction now REJECTS invalid option values (returns null) — behavior change**; open_lead_import.source description strengthened).
- **NOT applied**: `src/lib/ai/tools/index.ts` ui_action description update (enumerate exact filter values, "never claim a filter was applied", status param guidance).
- **NOT verified**: tsc, build, registry/tool smoke (temp smokes were wiped; expectations changed: invalid quick → rejected, all/converted/status accepted), browser tests (user does these).
- **User browser checklist (when resumed)**: 1) add status in Administration → appears in detail dropdown + Edit modal + table Filter Status; 2) "Apply the Converted filter" applies (no false success); 3) "Apply the Qualified filter" works; 4) "Open the CSV import screen for prospects" opens CSV screen; 5) pill row + admin status filter work.
- Do NOT re-propose as new work — resume from tools/index.ts edit.

## 2026-08-06 — Phase 3 M1 (Intent Planner) CODE COMPLETE
- **Files**: `src/lib/ai/planner/types.ts`, `planner.ts`, `executor.ts`; hook `runIntentPlanner` in `assistant.ts` (runs pre-LLM, after wizard/off-topic/credit gates, before the LLM loop — needs `timeline/stream/actions/chargeOnce` declared, so it sits just before `for (turn...)`).
- **Architecture**: deterministic decomposition (no LLM — matches wizard pattern). `decomposeIntent(goal)` → Plan{steps} with `depends_on` + `$ref` chaining (`$step.path`). `executePlan(plan, run, opts)` — injected ToolRunner keeps it pure/testable; production wires `executor.execute` (permission/timeline/stream).
- **Write steps**: `WRITE_TOOLS` set in planner.ts auto-marks `requires_approval` → reads run now, writes batch into ONE approval card. Per-row expansion: refs `$search.rows[N].x` re-point per index → one ProposedAction per found lead; empty rows skip the step; failed dependency skips dependents.
- **Smoke**: `/var/folders/.../opencode/phase3-planner-smoke.mts` → **17/17** (run with `--tsconfig /Users/apple/Desktop/LeadPro/tsconfig.json`). tsc + build clean.
- **Known quirk**: `next/font` build errors can be TRANSIENT (Google Fonts network fetch) — re-run before investigating; not code-related.
- **Browser tests (user)**: W1 "send a follow-up email to my new leads with subject: Hello and body: Hi there" → approval card per lead; W2 "create a segment of my qualified prospects" → one segment approval card.
- **M2 ideas**: per-step status chips in chat, continue-on-fail, LLM-assisted plan synthesis (validated by same engine), ui_actions as plan steps.
