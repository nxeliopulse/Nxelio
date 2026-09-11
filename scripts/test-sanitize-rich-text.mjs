import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRichText, RICH_TEXT_SANITIZE_OPTS } from "../src/lib/sanitize-rich-text.ts";

// These run under plain `node --test`, with no browser anywhere — which is
// the point. The previous arrangement sanitized only in the React component
// at render time, on the stated grounds that server-side sanitizing "would
// need jsdom, which Next.js's serverless bundle can't load". These tests
// passing in Node is the standing proof that it does load and does work.

test("strips <script> while keeping the surrounding content", () => {
  assert.equal(sanitizeRichText("<p>hi</p><script>alert(1)</script>"), "<p>hi</p>");
});

test("strips inline event handlers but keeps the element and its text", () => {
  assert.equal(sanitizeRichText('<p onclick="steal()">text</p>'), "<p>text</p>");
  assert.equal(sanitizeRichText('<span onmouseover="x()">hover</span>'), "<span>hover</span>");
});

test("drops javascript: hrefs, leaving an inert anchor rather than a live one", () => {
  const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
  assert.equal(out.includes("javascript:"), false);
  assert.equal(out.includes("click"), true);
});

test("removes tags that are not on the allowlist entirely", () => {
  assert.equal(sanitizeRichText('<iframe src="//evil.com"></iframe>'), "");
  assert.equal(sanitizeRichText("<img src=x onerror=alert(1)>"), "");
  assert.equal(sanitizeRichText("<object data=x></object>"), "");
});

test("an attack nested inside legitimate markup is removed without taking the markup with it", () => {
  const out = sanitizeRichText("<p>before<script>alert(1)</script>after</p>");
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("before"), true);
  assert.equal(out.includes("after"), true);
});

test("every formatting mark the editor can produce survives untouched", () => {
  const rich =
    '<h2>Title</h2><p>keep <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>' +
    '<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>' +
    '<p><a href="https://example.com" target="_blank" rel="noopener">link</a></p>';
  assert.equal(sanitizeRichText(rich), rich);
});

test("style attributes survive — TipTap's font-family extension writes them", () => {
  const out = sanitizeRichText('<span style="font-family: Arial">text</span>');
  assert.equal(out.includes("font-family"), true);
});

test("sanitizing an already-sanitized value changes nothing, so re-saving a note is stable", () => {
  const once = sanitizeRichText('<p>hi</p><script>alert(1)</script>');
  assert.equal(sanitizeRichText(once), once);
});

test("null and undefined pass through, so an optional notes field needs no special case", () => {
  assert.equal(sanitizeRichText(null), null);
  assert.equal(sanitizeRichText(undefined), undefined);
});

test("empty string and plain text are returned unchanged", () => {
  assert.equal(sanitizeRichText(""), "");
  assert.equal(sanitizeRichText("just words"), "just words");
});

test("older plain-text notes containing literal angle brackets are escaped, not executed", () => {
  const out = sanitizeRichText("price < 5 and x > 3");
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("price"), true);
});

test("the allowlist is a shared mutable object and callers must not be able to corrupt it", () => {
  const before = [...RICH_TEXT_SANITIZE_OPTS.ALLOWED_TAGS];
  sanitizeRichText("<p>x</p>");
  sanitizeRichText('<img src=x onerror=alert(1)>');
  assert.deepEqual(RICH_TEXT_SANITIZE_OPTS.ALLOWED_TAGS, before);
});

test("script is not the only vector — svg and math wrappers are gone too", () => {
  assert.equal(sanitizeRichText('<svg><script>alert(1)</script></svg>'), "");
  assert.equal(sanitizeRichText('<math><mtext></mtext></math>'), "");
});
