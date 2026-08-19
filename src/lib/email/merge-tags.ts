export interface MergeTagLead {
  full_name?: string | null;
  company_name?: string | null;
  industry?: string | null;
  email?: string | null;
  interest_area?: string | null;
}

const TAGS = [
  "firstName",
  "lastName",
  "fullName",
  "companyName",
  "industry",
  "email",
  "interest",
  "senderName",
] as const;

function splitName(fullName: string | null | undefined, companyName: string | null | undefined) {
  const source = (fullName && fullName.trim()) || (companyName && companyName.trim()) || "";
  if (!source) return { first: "there", last: "" };
  const parts = source.split(/\s+/);
  return { first: parts[0] || "there", last: parts.slice(1).join(" ") };
}

/** Turns lead-controlled text into inert HTML — every value a merge tag
 *  inserts (name, company, etc.) comes from a public capture/booking form,
 *  so it must never be able to inject markup into an HTML message. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace {{tag}} merge tags inside a string with values from the given lead.
 * Tags are matched case-insensitively and may include arbitrary whitespace
 * inside the braces, e.g. `{{ firstName }}`.
 *
 * Pass `{ escapeValues: true }` whenever the result is going to be rendered
 * or sent as HTML (e.g. a rich-text sequence step, a newsletter block, or a
 * preview using dangerouslySetInnerHTML) — every substituted value came from
 * a lead-editable field, so without escaping, a lead named
 * `<img src=x onerror=...>` could run script in whoever views the result.
 * Leave it off for plain-text destinations (email subjects, LinkedIn
 * messages, plain-text bodies) where the raw characters must show as typed.
 */
export function substituteMergeTags(
  text: string,
  lead: MergeTagLead,
  senderName?: string,
  opts?: { escapeValues?: boolean }
): string {
  if (!text) return text;

  const wrap = opts?.escapeValues ? escapeHtml : (s: string) => s;
  const { first, last } = splitName(lead.full_name, lead.company_name);
  const values: Record<(typeof TAGS)[number], string> = {
    firstName: wrap(first),
    lastName: wrap(last),
    fullName: wrap((lead.full_name && lead.full_name.trim()) || (lead.company_name && lead.company_name.trim()) || "there"),
    companyName: wrap((lead.company_name && lead.company_name.trim()) || ""),
    industry: wrap((lead.industry && lead.industry.trim()) || ""),
    email: wrap((lead.email && lead.email.trim()) || ""),
    interest: wrap((lead.interest_area && lead.interest_area.trim()) || ""),
    senderName: wrap((senderName && senderName.trim()) || "The Nxelio Nurture team"),
  };

  let out = text;
  for (const tag of TAGS) {
    const pattern = new RegExp(`\\{\\{\\s*${tag}\\s*\\}\\}`, "gi");
    out = out.replace(pattern, values[tag]);
  }
  return out;
}
