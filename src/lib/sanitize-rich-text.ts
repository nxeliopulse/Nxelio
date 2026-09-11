import DOMPurify from "isomorphic-dompurify";

/**
 * ============================================================================
 * Rich-text sanitizing — one allowlist, both sides of the wire
 * ============================================================================
 * Every rich-text body in the app comes from the TipTap editor, which means
 * it is HTML that eventually reaches `dangerouslySetInnerHTML`. Two rules:
 *
 *   1. Sanitize on WRITE, so the database never holds a live payload.
 *   2. Sanitize on READ too, because rows written before this existed were
 *      stored raw, and nothing re-sanitizes them on the way out.
 *
 * Why both. The previous arrangement sanitized only at render time, and a
 * comment in contact-notes.ts explained that server-side sanitizing "would
 * need jsdom, which Next.js's serverless bundle can't load". That is not the
 * case: isomorphic-dompurify is already a dependency, already used by the
 * client cards, and runs fine under Node — verified against <script>,
 * onerror=, javascript: hrefs, inline handlers and <iframe>.
 *
 * Render-time-only sanitizing was safe as long as every render path
 * remembered to call it. All four did. But the stored value was still a live
 * payload waiting for a fifth path that forgot — an email digest, a PDF
 * export, an AI summary feeding note text to a model. Sanitizing on write
 * means the dangerous version never exists at rest.
 *
 * The allowlist below was duplicated verbatim in three components
 * (contact-notes-card, account-notes-card, opportunity-detail-view). Three
 * copies of a security control drift. This is the only copy now.
 * ============================================================================
 */

/** Tags and attributes TipTap can legitimately produce. Everything else is stripped.
 *  Deliberately NOT `as const`: DOMPurify's Config types these as mutable
 *  `string[]`, and a readonly tuple will not assign to it. */
export const RICH_TEXT_SANITIZE_OPTS: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] } = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "span", "h1", "h2", "h3"],
  ALLOWED_ATTR: ["href", "target", "rel", "style"],
};

/**
 * Strips anything executable from a rich-text body.
 *
 * Safe to call on the server and in the browser — isomorphic-dompurify picks
 * the real DOM in the browser and a jsdom window under Node.
 *
 * Null/undefined pass straight through, so callers that store an optional
 * notes field can wrap the value without special-casing "no notes".
 */
export function sanitizeRichText(html: string): string;
export function sanitizeRichText(html: string | null | undefined): string | null | undefined;
export function sanitizeRichText(html: string | null | undefined): string | null | undefined {
  if (html === null || html === undefined) return html;
  // Fresh copy per call — DOMPurify may mutate the config it is handed, and
  // the exported constant is shared by every caller.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_SANITIZE_OPTS.ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_SANITIZE_OPTS.ALLOWED_ATTR],
  });
}
