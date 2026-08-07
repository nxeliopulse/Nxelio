/**
 * ============================================================================
 * Phase 2 — UI Action Registry
 * ============================================================================
 * Declarative, whitelisted UI actions the AI assistant can emit. The model may
 * ONLY reference actions defined here (never invent ids/targets). Actions are
 * safe by construction: "navigate" just moves the user to a page, "modal"
 * opens an existing app form pre-filled — NOTHING mutates data until the user
 * clicks Save in the real UI. Mutating flows keep using the Phase 1 approval
 * cards.
 *
 * Pure data — no React, no server imports — so it's shared safely between
 * the server (assistant.ts / tools) and the client (ui-action-provider).
 * ============================================================================
 */

export type UiActionKind = "navigate" | "modal" | "filter" | "button";

export interface UiActionParam {
  key: string;
  description: string;
  required: boolean;
  /** Alternate keys the model may pass (e.g. create_lead's full_name/company_name). */
  aliases?: string[];
  /** Allowed values — anything else is dropped during validation. */
  options?: string[];
}

export interface UiActionDef {
  id: string;
  name: string;
  /** What the model should pass for this action. */
  description: string;
  kind: UiActionKind;
  /** navigate: app route to push (absolute, no placeholders for now). */
  target?: string;
  /** modal: id the client shell knows how to open. */
  modal?: string;
  /** modal: page that owns this modal — provider navigates there before opening. */
  page?: string;
  /** button: a named, safe client-side operation. Never a raw DOM selector. */
  button?: "refresh_current_page";
  params: UiActionParam[];
}

/** What actually travels from assistant.ts → the chat widget → the provider. */
export interface UiActionCall {
  id: string;
  /** Human label shown on the action card. */
  label: string;
  params?: Record<string, unknown>;
}

export const UI_ACTIONS: UiActionDef[] = [
  // ---- Navigation -----------------------------------------------------------
  { id: "navigate_dashboard", name: "Go to Dashboard", description: "Open the dashboard page.", kind: "navigate", target: "/dashboard", params: [] },
  { id: "navigate_leads", name: "Go to Prospects", description: "Open the prospects (leads) list page.", kind: "navigate", target: "/leads", params: [] },
  { id: "navigate_accounts", name: "Go to Accounts", description: "Open the accounts page.", kind: "navigate", target: "/accounts", params: [] },
  { id: "navigate_contacts", name: "Go to Contacts", description: "Open the contacts page.", kind: "navigate", target: "/contacts", params: [] },
  { id: "navigate_campaigns", name: "Go to Campaigns", description: "Open the campaigns page.", kind: "navigate", target: "/campaigns", params: [] },
  { id: "navigate_segments", name: "Go to Segments", description: "Open the segments page.", kind: "navigate", target: "/segments", params: [] },
  { id: "navigate_opportunities", name: "Go to Opportunities", description: "Open the opportunities page.", kind: "navigate", target: "/opportunities", params: [] },
  { id: "navigate_newsletters", name: "Go to Newsletters", description: "Open the newsletters page.", kind: "navigate", target: "/newsletters", params: [] },
  { id: "navigate_analytics", name: "Go to Analytics", description: "Open the analytics page.", kind: "navigate", target: "/analytics", params: [] },
  { id: "navigate_users", name: "Go to Administration", description: "Open the user administration page.", kind: "navigate", target: "/users", params: [] },
  { id: "navigate_settings", name: "Go to Settings", description: "Open the settings page.", kind: "navigate", target: "/settings", params: [] },
  { id: "navigate_capture_form", name: "Go to Capture Form", description: "Open the lead capture form page.", kind: "navigate", target: "/capture-form", params: [] },

  // ---- Safe button actions -------------------------------------------------
  // Button actions are semantic operations, not arbitrary DOM clicks. This
  // keeps the client-side controller whitelisted and prevents the model from
  // targeting hidden or destructive controls.
  {
    id: "refresh_current_page",
    name: "Refresh this page",
    description: "Refresh the current page's server data without changing any records.",
    kind: "button",
    button: "refresh_current_page",
    params: [],
  },

  // ---- Modals / flows -------------------------------------------------------
  {
    id: "open_lead_form", name: "Open New Prospect form",
    description: "Open the 'Add Leads' wizard pre-filled with the given details (nothing is saved until the user clicks import).",
    kind: "modal", modal: "lead_wizard", page: "/leads",
    params: [
      { key: "name", description: "Full name", required: false, aliases: ["full_name"] },
      { key: "email", description: "Email address", required: false },
      { key: "company", description: "Company name", required: false, aliases: ["company_name"] },
      { key: "job_title", description: "Job title", required: false, aliases: ["title"] },
      { key: "phone", description: "Phone number", required: false },
    ],
  },
  {
    id: "open_lead_import", name: "Open Import screen",
    description: "Open the 'Add Leads' wizard straight on a data-entry screen (nothing is saved until the user imports).",
    kind: "modal", modal: "lead_wizard", page: "/leads",
    params: [
      {
        key: "source", required: false,
        description: "Which import screen to open — ALWAYS pass the source when the user names a method: csv (CSV file / upload / spreadsheet import), linkedin-search (LinkedIn search), linkedin-post (LinkedIn post), youtube (YouTube), manual (manual entry), buy (buy leads). Omit only when the user did not say how they want to add leads.",
        options: ["linkedin-search", "linkedin-post", "youtube", "manual", "buy", "csv"],
      },
    ],
  },

  // ---- Filters --------------------------------------------------------------
  {
    id: "apply_lead_filters", name: "Apply Filters",
    description: "Apply status/industry/interest filters to the prospects table (opens the page first if needed).",
    kind: "filter", target: "/leads",
    params: [
      {
        key: "quick",
        description: "Status quick-filter. ONLY these values exist (do NOT invent others, there is no 'warm'/'scored'/'closed' filter): all (clear the status filter), new, qualified, hot, followup, converted. If the user names a filter outside this list, tell them it isn't available — never claim it was applied.",
        required: false,
        options: ["all", "new", "qualified", "hot", "followup", "converted"],
      },
      {
        key: "status",
        description: "Exact lead status name as shown in the app / Administration picklist (e.g. 'New', 'Contacted', 'Qualified', 'Nurturing', 'Converted', or any status the user mentions they added). Use this when the user names a specific status that isn't one of the quick values. Match the exact casing the leads table shows.",
        required: false,
      },
      { key: "industry", description: "Industry to filter by", required: false },
      { key: "interest", description: "Interest area to filter by", required: false },
    ],
  },
];

const BY_ID = new Map(UI_ACTIONS.map((a) => [a.id, a]));

/** Resolve + validate a raw model emission. Unknown ids or params → null (the
 *  model gets an error result and must not invent ids). A param that has an
 *  allowed-value list receiving an invalid value also rejects the whole action
 *  (null) — otherwise the card would fire with the value silently dropped and
 *  the model would wrongly claim success ("applied Converted filter" etc.). */
export function resolveUiAction(rawId: unknown, rawParams?: unknown): UiActionCall | null {
  if (typeof rawId !== "string") return null;
  const def = BY_ID.get(rawId);
  if (!def) return null;
  const params: Record<string, unknown> = {};
  if (rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)) {
    const raw = rawParams as Record<string, unknown>;
    for (const p of def.params) {
      let v = raw[p.key];
      if (v === undefined && p.aliases) {
        for (const a of p.aliases) {
          if (raw[a] !== undefined) { v = raw[a]; break; }
        }
      }
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (!trimmed) continue;
        if (p.options && !p.options.includes(trimmed)) return null; // invalid option → reject the whole action
        params[p.key] = trimmed;
      }
    }
  }
  const hasParams = Object.keys(params).length > 0;
  const label = def.kind === "navigate"
    ? def.name
    : `${def.name}${params.name ? ` — ${String(params.name)}` : ""}`;
  return { id: def.id, label, ...(hasParams ? { params } : {}) };
}

export function getUiActionDef(id: string): UiActionDef | undefined {
  return BY_ID.get(id);
}
