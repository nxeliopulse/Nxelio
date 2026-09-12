import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeNoteHtml } from "../src/lib/sanitize-note-html.ts";

// These run under plain `node --test` with no DOM and no jsdom anywhere.
// That is the point: the previous attempt at this fix needed a fake browser
// on the server and had to be reverted. If these pass, the cleaning works in
// exactly the environment a serverless function provides.

test("removes <script> and its contents, keeping the surrounding text", () => {
  const out = sanitizeNoteHtml("<p>hi</p><script>alert(1)</script>");
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("alert"), false);
  assert.equal(out.includes("hi"), true);
});

test("strips inline event handlers but keeps the element and its text", () => {
  assert.equal(sanitizeNoteHtml('<p onclick="steal()">text</p>'), "<p>text</p>");
  assert.equal(sanitizeNoteHtml('<span onmouseover="x()">hover</span>'), "<span>hover</span>");
  assert.equal(sanitizeNoteHtml('<a href="https://ok.com" onerror="x()">link</a>'), '<a href="https://ok.com">link</a>');
});

test("drops javascript: and data: hrefs, leaving an inert anchor", () => {
  for (const bad of [
    '<a href="javascript:alert(1)">click</a>',
    '<a href="JaVaScRiPt:alert(1)">click</a>',
    '<a href="data:text/html,<script>alert(1)</script>">click</a>',
  ]) {
    const out = sanitizeNoteHtml(bad);
    assert.equal(/javascript:/i.test(out), false, bad);
    assert.equal(out.includes("click"), true, bad);
  }
});

test("keeps ordinary links working", () => {
  const out = sanitizeNoteHtml('<a href="https://example.com" target="_blank" rel="noopener">link</a>');
  assert.equal(out.includes('href="https://example.com"'), true);
  assert.equal(out.includes("_blank"), true);
});

test("removes tags that are not on the allowlist", () => {
  assert.equal(sanitizeNoteHtml('<iframe src="//evil.com"></iframe>'), "");
  assert.equal(sanitizeNoteHtml("<img src=x onerror=alert(1)>"), "");
  assert.equal(sanitizeNoteHtml("<object data=x></object>"), "");
  assert.equal(sanitizeNoteHtml("<embed src=x>"), "");
  assert.equal(sanitizeNoteHtml("<form><input></form>"), "");
});

test("an attack nested inside real markup goes without taking the markup with it", () => {
  const out = sanitizeNoteHtml("<p>before<script>alert(1)</script>after</p>");
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("before"), true);
  assert.equal(out.includes("after"), true);
});

test("every formatting mark the editor produces survives untouched", () => {
  const rich =
    "<h2>Title</h2><p>keep <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>" +
    "<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>";
  assert.equal(sanitizeNoteHtml(rich), rich);
});

test("style survives — TipTap's font-family extension writes it", () => {
  const out = sanitizeNoteHtml('<span style="font-family: Arial">text</span>');
  assert.equal(out.includes("font-family"), true);
  assert.equal(out.includes("text"), true);
});

test("cleaning an already-clean value changes nothing, so re-saving is stable", () => {
  const once = sanitizeNoteHtml("<p>hi</p><script>alert(1)</script>");
  assert.equal(sanitizeNoteHtml(once), once);
});

test("null and undefined pass through for optional notes columns", () => {
  assert.equal(sanitizeNoteHtml(null), null);
  assert.equal(sanitizeNoteHtml(undefined), undefined);
});

test("empty string and plain text come back unchanged", () => {
  assert.equal(sanitizeNoteHtml(""), "");
  assert.equal(sanitizeNoteHtml("just words"), "just words");
});

test("the empty-note sentinel the note actions store is preserved", () => {
  // createContactNote/createAccountNote store this exact string when a note
  // has only attachments; cleaning must not turn it into something else.
  assert.equal(sanitizeNoteHtml("<p>Attached a file</p>"), "<p>Attached a file</p>");
});

test("svg and math wrappers are removed too — script is not the only vector", () => {
  assert.equal(sanitizeNoteHtml("<svg><script>alert(1)</script></svg>"), "");
  assert.equal(/onload/i.test(sanitizeNoteHtml('<svg onload="alert(1)"></svg>')), false);
});

test("runs with no DOM present — the whole reason for this library", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(sanitizeNoteHtml("<p>ok</p><script>x()</script>"), "<p>ok</p>");
});
