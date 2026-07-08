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

/**
 * Replace {{tag}} merge tags inside a string with values from the given lead.
 * Tags are matched case-insensitively and may include arbitrary whitespace
 * inside the braces, e.g. `{{ firstName }}`.
 */
export function substituteMergeTags(
  text: string,
  lead: MergeTagLead,
  senderName?: string
): string {
  if (!text) return text;

  const { first, last } = splitName(lead.full_name, lead.company_name);
  const values: Record<(typeof TAGS)[number], string> = {
    firstName: first,
    lastName: last,
    fullName: (lead.full_name && lead.full_name.trim()) || (lead.company_name && lead.company_name.trim()) || "there",
    companyName: (lead.company_name && lead.company_name.trim()) || "",
    industry: (lead.industry && lead.industry.trim()) || "",
    email: (lead.email && lead.email.trim()) || "",
    interest: (lead.interest_area && lead.interest_area.trim()) || "",
    senderName: (senderName && senderName.trim()) || "The LeadPro team",
  };

  let out = text;
  for (const tag of TAGS) {
    const pattern = new RegExp(`\\{\\{\\s*${tag}\\s*\\}\\}`, "gi");
    out = out.replace(pattern, values[tag]);
  }
  return out;
}
