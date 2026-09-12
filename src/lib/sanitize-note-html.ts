import sanitizeHtml from "sanitize-html";

/**
 * ============================================================================
 * Server-side cleaning for rich-text bodies
 * ============================================================================
 * Note and opportunity bodies are TipTap HTML that ends up in
 * dangerouslySetInnerHTML. Until now they were stored exactly as submitted —
 * the only defence was each screen cleaning at render time. All four screens
 * do, so nothing is currently exploitable, but the live payload sat in the
 * database waiting for a fifth reader that forgets: an email digest, a PDF
 * export, an AI summary piping note text to a model.
 *
 * Why sanitize-html and not DOMPurify. DOMPurify needs a DOM; on the server
 * that means isomorphic-dompurify, which loads jsdom. An earlier attempt at
 * this fix did exactly that, coincided with /opportunities returning 500, and
 * was reverted on the theory — inherited from a comment in the old code — that
 * "Next.js's serverless bundle can't load" jsdom.
 *
 * That theory does not survive checking. jsdom is in the server bundle either
 * way: the four note/email cards are "use client" but still server-render, and
 * they import isomorphic-dompurify themselves. So jsdom was present before
 * that attempt, during it, and is present now. It was almost certainly never
 * the cause of the 500, which remains unexplained.
 *
 * sanitize-html is still the right choice here, for a smaller and more honest
 * reason: it parses with htmlparser2, needs no DOM at all, and adds nothing to
 * the server bundle that was not already required. It is testable under plain
 * `node --test`, which a DOM-dependent sanitizer is not.
 *
 * The client screens are deliberately NOT changed. They keep their own
 * DOMPurify pass, which still runs in a real browser DOM where it belongs and
 * still protects every row written before today. This module only adds a
 * second gate on the way in.
 * ============================================================================
 */

/** Mirrors the DOMPurify allowlist the note cards already use at render time.
 *  Kept identical on purpose: a body that survives one pass must survive the
 *  other, or saving would visibly strip formatting that display allows. */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "span", "h1", "h2", "h3",
];

const ALLOWED_ATTRIBUTES = ["href", "target", "rel", "style"];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  // Same four attributes on any permitted tag, matching ALLOWED_ATTR on the
  // client. `style` passes through unfiltered there too — tightening it here
  // would silently drop formatting the editor legitimately writes
  // (TipTap's font-family extension emits style="font-family: …").
  allowedAttributes: { "*": ALLOWED_ATTRIBUTES },
  // Anything not on the tag list loses its markup but keeps its text, except
  // these, where the text is the payload and must go with it.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  // The default already excludes javascript:, but state it rather than
  // inherit it — this is the line that stops <a href="javascript:...">.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Editor output is a fragment, not a document.
  enforceHtmlBoundary: false,
};

/**
 * Strips anything executable from a rich-text body.
 *
 * Runs anywhere Node runs — no DOM, no jsdom, no browser globals — so it is
 * safe inside "use server" modules and serverless functions.
 *
 * null/undefined pass straight through so callers storing an optional notes
 * column can wrap the value without special-casing "no notes".
 */
export function sanitizeNoteHtml(html: string): string;
export function sanitizeNoteHtml(html: string | null | undefined): string | null | undefined;
export function sanitizeNoteHtml(html: string | null | undefined): string | null | undefined {
  if (html === null || html === undefined) return html;
  return sanitizeHtml(html, OPTIONS);
}
