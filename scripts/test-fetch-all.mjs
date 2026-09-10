import test from "node:test";
import assert from "node:assert/strict";
import { fetchAll, fetchAllIn, countRows, countRowsIn, insertAllReturning } from "../src/lib/supabase/fetch-all.ts";

/**
 * Fake PostgREST table. Honours `.range(from, to)` inclusively and applies a
 * server-side row cap the same way db-max-rows does: silently, with no error
 * and no signal that anything was withheld. That silence is the whole reason
 * the original bug went unnoticed, so the fake has to reproduce it.
 */
function fakeTable(rowCount, { cap = 1000 } = {}) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const calls = [];
  return {
    calls,
    page(from, to) {
      calls.push([from, to]);
      const requested = rows.slice(from, to + 1);
      return Promise.resolve({ data: requested.slice(0, cap), error: null });
    },
  };
}

test("fetchAll: returns every row past the 1000 cap", async () => {
  const t = fakeTable(3000);
  const { data, error, truncated } = await fetchAll(t.page);
  assert.equal(error, null);
  assert.equal(truncated, false);
  assert.equal(data.length, 3000, "all 3000 rows, not the capped 1000");
  // No duplicates and nothing skipped.
  assert.equal(new Set(data.map((r) => r.id)).size, 3000);
  assert.equal(data[0].id, 0);
  assert.equal(data[2999].id, 2999);
});

test("fetchAll: exactly-at-cap and just-over-cap boundaries", async () => {
  for (const n of [999, 1000, 1001, 2000, 2001]) {
    const { data } = await fetchAll(fakeTable(n).page);
    assert.equal(data.length, n, `${n} rows`);
  }
});

test("fetchAll: empty table makes one request and stops", async () => {
  const t = fakeTable(0);
  const { data, truncated } = await fetchAll(t.page);
  assert.deepEqual(data, []);
  assert.equal(truncated, false);
  assert.equal(t.calls.length, 1, "must not loop forever on an empty result");
});

test("fetchAll: correct when the server cap is LOWER than the page size", async () => {
  // A project configured with db-max-rows=250 returns short pages for a
  // 1000-row request. Advancing by pageSize instead of the real batch length
  // would skip 750 rows per page here.
  const t = fakeTable(900, { cap: 250 });
  const { data } = await fetchAll(t.page);
  assert.equal(data.length, 900);
  assert.equal(new Set(data.map((r) => r.id)).size, 900, "no gaps, no repeats");
});

test("fetchAll: pages are requested as contiguous inclusive ranges", async () => {
  const t = fakeTable(2500);
  await fetchAll(t.page);
  assert.deepEqual(t.calls.slice(0, 3), [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAll: respects a custom pageSize", async () => {
  const t = fakeTable(250, { cap: 1000 });
  const { data } = await fetchAll(t.page, { pageSize: 100 });
  assert.equal(data.length, 250);
  assert.deepEqual(t.calls, [[0, 99], [100, 199], [200, 299]]);
});

test("fetchAll: maxRows truncates loudly instead of silently", async () => {
  const t = fakeTable(5000);
  const { data, truncated, error } = await fetchAll(t.page, { maxRows: 2000 });
  assert.equal(data.length, 2000);
  assert.equal(truncated, true, "caller can tell the data is partial");
  assert.equal(error, null);
});

test("fetchAll: an error mid-paging returns partial rows AND the error", async () => {
  let call = 0;
  const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i }));
  const { data, error, truncated } = await fetchAll((from, to) => {
    call++;
    if (call === 3) return Promise.resolve({ data: null, error: { message: "boom" } });
    return Promise.resolve({ data: rows.slice(from, to + 1).slice(0, 1000), error: null });
  });
  assert.equal(data.length, 2000, "keeps the pages that did arrive");
  assert.equal(error.message, "boom");
  assert.equal(truncated, true);
});

test("fetchAllIn: chunks the key list and returns the union", async () => {
  // 250 lead ids, each owning 8 activities => 2000 rows, over the cap.
  const ids = Array.from({ length: 250 }, (_, i) => `lead-${i}`);
  const seenChunks = [];
  const { data } = await fetchAllIn(ids, (chunk, from, to) => {
    if (from === 0) seenChunks.push(chunk.length);
    const rows = chunk.flatMap((id) => Array.from({ length: 8 }, (_, k) => ({ id: `${id}:${k}` })));
    return Promise.resolve({ data: rows.slice(from, to + 1).slice(0, 1000), error: null });
  });
  assert.deepEqual(seenChunks.sort((a, b) => b - a), [100, 100, 50], "chunks of 100");
  assert.equal(data.length, 2000);
  assert.equal(new Set(data.map((r) => r.id)).size, 2000, "no duplicates across chunks");
});

test("fetchAllIn: no keys means no request at all", async () => {
  let called = false;
  const { data, truncated } = await fetchAllIn([], () => {
    called = true;
    return Promise.resolve({ data: [], error: null });
  });
  assert.deepEqual(data, []);
  assert.equal(truncated, false);
  assert.equal(called, false, "`.in(col, [])` matches nothing — skip the round trip");
});

test("fetchAllIn: duplicate keys are collapsed before chunking", async () => {
  const ids = ["a", "b", "a", "b", "c", "a"];
  let keysSeen = null;
  await fetchAllIn(ids, (chunk) => {
    keysSeen = chunk;
    return Promise.resolve({ data: [], error: null });
  });
  assert.deepEqual(keysSeen, ["a", "b", "c"]);
});

test("fetchAllIn: keeps the URL small enough for the gateway", async () => {
  // The reason chunking exists: 1000 uuids in one `.in()` is ~37KB of query
  // string, past the ~8KB a gateway will accept. Assert the real constraint.
  const uuids = Array.from({ length: 1000 }, (_, i) => `123e4567-e89b-12d3-a456-${String(i).padStart(12, "0")}`);
  let widest = 0;
  await fetchAllIn(uuids, (chunk) => {
    widest = Math.max(widest, chunk.join(",").length);
    return Promise.resolve({ data: [], error: null });
  });
  assert.ok(widest < 8000, `widest chunk was ${widest} chars of query string`);
});

test("fetchAllIn: null keys means 'scope not active', not 'match nothing'", async () => {
  // The distinction matters: `if (ownerIds) q = q.in(...)` means an absent
  // scope must return EVERYTHING, while an empty scope must return nothing.
  const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
  const chunksSeen = [];
  const { data } = await fetchAllIn(null, (chunk, from, to) => {
    chunksSeen.push(chunk);
    return Promise.resolve({ data: rows.slice(from, to + 1).slice(0, 1000), error: null });
  });
  assert.equal(data.length, 1500, "unscoped means every row, still paged");
  assert.deepEqual(chunksSeen, [null, null], "the page builder is told there is no chunk");
});

test("fetchAllIn: empty array still means match nothing", async () => {
  const { data } = await fetchAllIn([], () =>
    Promise.resolve({ data: [{ id: 1 }], error: null })
  );
  assert.deepEqual(data, []);
});

test("countRowsIn: sums exact counts across chunks", async () => {
  // 250 keys, 3 each. `head: true` dodges the row cap but not the URL limit,
  // so the count has to be chunked and summed.
  const ids = Array.from({ length: 250 }, (_, i) => `k${i}`);
  const widths = [];
  const total = await countRowsIn(ids, (chunk) => {
    widths.push(chunk.length);
    return Promise.resolve({ count: chunk.length * 3, error: null });
  });
  assert.equal(total, 750);
  assert.deepEqual(widths, [100, 100, 50]);
});

test("countRowsIn: null scope counts once, empty scope counts zero", async () => {
  assert.equal(await countRowsIn(null, () => Promise.resolve({ count: 91, error: null })), 91);
  let called = false;
  const zero = await countRowsIn([], () => {
    called = true;
    return Promise.resolve({ count: 91, error: null });
  });
  assert.equal(zero, 0);
  assert.equal(called, false);
});

test("insertAllReturning: hands back every inserted row past the cap", async () => {
  // Reproduces the Buy Leads case: 2500 rows in, a server that only echoes
  // 1000 rows per insert. All 2500 must come back or the import count,
  // the archive, and AI scoring all silently miss the remainder.
  const rows = Array.from({ length: 2500 }, (_, i) => ({ name: `lead-${i}` }));
  const batches = [];
  const { data, error } = await insertAllReturning(rows, (batch) => {
    batches.push(batch.length);
    return Promise.resolve({ data: batch.slice(0, 1000), error: null });
  });
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.deepEqual(batches, [1000, 1000, 500]);
  assert.equal(data[2499].name, "lead-2499");
});

test("insertAllReturning: no rows means no request", async () => {
  let called = false;
  const { data, error } = await insertAllReturning([], () => {
    called = true;
    return Promise.resolve({ data: [], error: null });
  });
  assert.deepEqual(data, []);
  assert.equal(error, null);
  assert.equal(called, false);
});

test("insertAllReturning: reports the error and the rows already written", async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ name: `lead-${i}` }));
  let call = 0;
  const { data, error } = await insertAllReturning(rows, (batch) => {
    call++;
    if (call === 2) return Promise.resolve({ data: null, error: { message: "constraint violation" } });
    return Promise.resolve({ data: batch, error: null });
  });
  assert.equal(error.message, "constraint violation");
  assert.equal(data.length, 1000, "the first batch did land — say so rather than reporting 0");
});

test("countRows: reads the count and never touches rows", async () => {
  assert.equal(await countRows(Promise.resolve({ count: 4212, error: null })), 4212);
  assert.equal(await countRows(Promise.resolve({ count: 0, error: null })), 0);
  assert.equal(await countRows(Promise.resolve({ count: null, error: null })), 0);
});

test("countRows: an error reports 0 rather than throwing on a dashboard", async () => {
  assert.equal(await countRows(Promise.resolve({ count: null, error: { message: "nope" } })), 0);
});
