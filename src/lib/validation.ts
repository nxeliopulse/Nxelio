// Shared input validation used across every form that collects an email or
// website address — keeps a single definition of "valid" instead of each
// modal inventing its own (looser) check.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty string is treated as valid — these fields are optional; only a
 *  non-empty value that doesn't look like an email is rejected. */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v === "" || EMAIL_RE.test(v);
}

/** Accepts a bare domain ("acme.com"), with path ("acme.com/about"), or a
 *  full URL with protocol. Rejects plain text like "ABC" by requiring at
 *  least one dot and a real-looking domain segment. Empty string is valid
 *  (optional field). */
export function isValidWebsite(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  const withProtocol = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const { hostname } = new URL(withProtocol);
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname);
  } catch {
    return false;
  }
}

/** Accepts a bare "linkedin.com/in/..." path or a full URL with protocol, on
 *  linkedin.com itself (any subdomain/country prefix, e.g. "uk.linkedin.com")
 *  — rejects any other domain, including lookalikes and other social sites.
 *  Empty string is valid (optional field). */
export function isValidLinkedIn(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  const withProtocol = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const { hostname } = new URL(withProtocol);
    return /^([a-z0-9-]+\.)*linkedin\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

export const EMAIL_ERROR = "Enter a valid email address (e.g. name@company.com).";
export const WEBSITE_ERROR = "Enter a valid website (e.g. company.com).";
export const LINKEDIN_ERROR = "Enter a valid LinkedIn URL (e.g. linkedin.com/in/username).";
