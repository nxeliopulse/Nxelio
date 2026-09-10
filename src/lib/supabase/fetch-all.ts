import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * ============================================================================
 * Row-cap-safe fetching
 * ============================================================================
 * PostgREST (what Supabase serves) caps how many rows ONE request may return.
 * On hosted projects `db-max-rows` defaults to 1000. Critically it does NOT
 * error when the cap bites — it returns exactly that many rows with a 200 and
 * a Content-Range header nobody reads. So this:
 *
 *     const { data } = await supabase.from("leads").select("status");
 *     return { total: data.length };
 *
 * silently answers "1000" for a workspace holding 3000 leads, and every rate
 * derived from it is wrong in the same direction. That was live: analytics
 * clamped at 1000 while the comparison period next to it used
 * `{ count: "exact", head: true }` (uncapped), so a flat month rendered as a
 * 67% collapse. The Pro plan grants 2000 discovered leads per cycle, so every
 * Pro workspace crossed the cap inside its first month.
 *
 * Use `countRows` when only a total is needed — it never ships rows at all.
 * Use `fetchAll` / `fetchAllIn` when the rows themselves are needed.
 * ============================================================================
 */

/** Matches PostgREST's own default `db-max-rows`. A page larger than the
 *  server's cap is harmless — see the `serverPageSize` logic in fetchAll. */
const DEFAULT_PAGE_SIZE = 1000;

/**
 * Hard ceiling on rows pulled into memory by a single fetchAll call.
 * Paging correctly means a runaway table can now really return everything,
 * which is its own way to take the pod down. Hitting this logs loudly and
 * flags `truncated` so a caller can surface "showing partial data" rather
 * than quietly lying again — the exact failure mode this file exists to fix.
 */
const DEFAULT_MAX_ROWS = 50_000;

/**
 * How many keys go into one `.in(...)` filter. `.in()` is serialized into the
 * request URL, so 1000 uuids is ~37KB of query string against a gateway that
 * rejects anything past ~8KB. 100 keys keeps a chunk near 4KB.
 */
const DEFAULT_CHUNK_SIZE = 100;

/** Chunks fetched at once by fetchAllIn. Analytics pages already fan out
 *  several of these in parallel, so this stays low on purpose. */
const CHUNK_CONCURRENCY = 4;

export interface FetchAllResult<T> {
  data: T[];
  error: PostgrestError | null;
  /** true when the result is incomplete — an error mid-page, or maxRows hit. */
  truncated: boolean;
}

/** One page of a query. Shaped to accept a Supabase builder directly. */
type PageQuery<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

export interface FetchAllOptions {
  pageSize?: number;
  maxRows?: number;
  /** Named in the log line when maxRows is hit. */
  label?: string;
}

/**
 * Reads EVERY row a query matches, one page at a time.
 *
 * `page` must build a FRESH query each call — a Supabase builder is consumed
 * once awaited and cannot be replayed:
 *
 *     const { data } = await fetchAll((from, to) =>
 *       supabase.from("leads").select("id, status").order("id").range(from, to)
 *     );
 *
 * The query MUST carry a total `.order(...)`. Postgres gives no ordering
 * guarantee without one, so two pages of an unordered query can repeat and
 * skip rows — quietly wrong in a new way. Order by a unique column, or add a
 * unique tiebreaker after a non-unique one: `created_at` collides across a
 * bulk lead import, so `.order("created_at").order("id")` is the safe form.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PageQuery<T>,
  opts: FetchAllOptions = {}
): Promise<FetchAllResult<T>> {
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const maxRows = Math.max(1, opts.maxRows ?? DEFAULT_MAX_ROWS);

  const rows: T[] = [];
  let from = 0;
  // Largest page the server has actually returned. The server may cap below
  // `pageSize`, so "shorter than requested" does NOT mean "last page" — but
  // "shorter than a length the server has already proven it can return" does.
  // Advancing by the real batch length (not pageSize) keeps this correct even
  // when db-max-rows is set lower than DEFAULT_PAGE_SIZE.
  let serverPageSize = 0;

  for (;;) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) {
      // Return what we have plus the error, so a caller that ignores `error`
      // degrades to partial data instead of throwing on a dashboard.
      return { data: rows, error, truncated: true };
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    rows.push(...batch);

    if (batch.length < serverPageSize) break;
    if (batch.length > serverPageSize) serverPageSize = batch.length;

    from += batch.length;

    if (rows.length >= maxRows) {
      console.error(
        `[fetchAll] ${opts.label || "query"} hit the ${maxRows}-row ceiling and was truncated. ` +
          "Aggregate this in SQL (an RPC or a count) instead of reading rows into the app."
      );
      return { data: rows.slice(0, maxRows), error: null, truncated: true };
    }
  }

  return { data: rows, error: null, truncated: false };
}

export interface FetchAllInOptions extends FetchAllOptions {
  chunkSize?: number;
}

/**
 * `fetchAll` for a query filtered by a list of keys — `.in("lead_id", ids)`.
 *
 * Two separate caps apply to that pattern and this handles both: the key list
 * is chunked so the URL stays under the gateway limit, and each chunk is then
 * paged so a chunk matching more than db-max-rows rows still comes back whole.
 * (A single lead can own hundreds of activities, so 100 lead ids routinely
 * match far more than 100 rows.)
 *
 *     const { data } = await fetchAllIn(leadIds, (chunk, from, to) =>
 *       supabase.from("lead_activities").select("lead_id, activity_type")
 *         .in("lead_id", chunk).order("id").range(from, to)
 *     );
 *
 * An empty key list short-circuits to `[]` with no request — `.in(col, [])`
 * matches nothing anyway, and several callers already guarded for it by hand.
 */
/** Page builder for a required key list — `chunk` is always present. */
type ChunkPage<K, T> = (chunk: K[], from: number, to: number) => PageQuery<T>;
/** Page builder for an OPTIONAL scope — `chunk` is null when it isn't active. */
type ScopePage<K, T> = (chunk: K[] | null, from: number, to: number) => PageQuery<T>;

// Two overloads so `chunk` is only nullable when the caller actually passes a
// nullable scope. Without them every call site would have to null-check a
// `chunk` that cannot be null, purely to satisfy the optional-scope form.
export function fetchAllIn<K, T>(
  keys: readonly K[],
  page: ChunkPage<K, T>,
  opts?: FetchAllInOptions
): Promise<FetchAllResult<T>>;
export function fetchAllIn<K, T>(
  keys: readonly K[] | null,
  page: ScopePage<K, T>,
  opts?: FetchAllInOptions
): Promise<FetchAllResult<T>>;
export async function fetchAllIn<K, T>(
  keys: readonly K[] | null,
  page: ChunkPage<K, T> | ScopePage<K, T>,
  opts: FetchAllInOptions = {}
): Promise<FetchAllResult<T>> {
  // `null` means "this scope filter isn't active" — the queries here are
  // routinely narrowed by an optional owner/team scope (`if (ownerIds) q =
  // q.in(...)`), and passing null keeps that one shape instead of forcing
  // every such call site to branch between fetchAllIn and fetchAll.
  // An empty ARRAY is the opposite and still means "matches nothing".
  if (keys === null) {
    // Narrowed by the overloads: reaching here means the caller used the
    // nullable-scope form, so `page` accepts null. Calling a union of
    // signatures intersects their parameters, which is why this one cast is
    // needed here rather than at each call site.
    return fetchAll<T>((from, to) => (page as ScopePage<K, T>)(null, from, to), opts);
  }

  const unique = [...new Set(keys)];
  if (unique.length === 0) return { data: [], error: null, truncated: false };

  const chunkSize = Math.max(1, opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const chunks: K[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  // Per-chunk budget, so `maxRows` stays a ceiling on the whole call rather
  // than one that each chunk gets to spend in full.
  const maxRows = Math.max(1, opts.maxRows ?? DEFAULT_MAX_ROWS);
  const results: FetchAllResult<T>[] = new Array(chunks.length);

  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const index = next++;
      results[index] = await fetchAll<T>(
        (from, to) => page(chunks[index], from, to),
        { ...opts, maxRows }
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker)
  );

  const rows: T[] = [];
  let error: PostgrestError | null = null;
  let truncated = false;
  for (const result of results) {
    rows.push(...result.data);
    if (result.error && !error) error = result.error;
    if (result.truncated) truncated = true;
  }

  if (rows.length > maxRows) {
    console.error(
      `[fetchAllIn] ${opts.label || "query"} returned more than ${maxRows} rows across ` +
        `${chunks.length} chunks and was truncated. Aggregate this in SQL instead.`
    );
    return { data: rows.slice(0, maxRows), error, truncated: true };
  }

  return { data: rows, error, truncated };
}

/**
 * Inserts rows in batches and returns EVERY inserted row.
 *
 * The row cap applies to an insert's returned representation too, which is
 * subtler than it looks: `insert(2500 rows).select()` writes all 2500 but
 * hands back 1000. Callers that trust the returned array then under-report
 * the import count, archive only part of the batch, and skip follow-up work
 * (AI scoring) on the remainder — all with `error` still null. Buy Leads
 * imports up to 2000 rows at once on Pro, so this was reachable in one click.
 *
 *     const { data, error } = await insertAllReturning(rows, (batch) =>
 *       supabase.from("leads").insert(batch).select()
 *     );
 *
 * Batches are sequential on purpose: a partial failure should stop rather
 * than race ahead, and `data` then holds exactly the rows that did land.
 */
export async function insertAllReturning<Row, T>(
  rows: readonly Row[],
  insert: (batch: Row[]) => PageQuery<T>,
  opts: { batchSize?: number; label?: string } = {}
): Promise<{ data: T[]; error: PostgrestError | null }> {
  if (rows.length === 0) return { data: [], error: null };

  // Kept at/below the row cap so one batch's returned representation is never
  // itself clamped.
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE));
  const inserted: T[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const { data, error } = await insert(rows.slice(i, i + batchSize));
    if (error) {
      if (i > 0) {
        console.error(
          `[insertAllReturning] ${opts.label || "insert"} failed after ${inserted.length} of ` +
            `${rows.length} rows were already written: ${error.message}`
        );
      }
      return { data: inserted, error };
    }
    inserted.push(...(data ?? []));
  }

  return { data: inserted, error: null };
}

type CountQuery = PromiseLike<{ count: number | null; error: PostgrestError | null }>;
/** Count builder for a required key list. */
type ChunkCount<K> = (chunk: K[]) => CountQuery;
/** Count builder for an OPTIONAL scope — null when it isn't active. */
type ScopeCount<K> = (chunk: K[] | null) => CountQuery;

/**
 * `countRows` for a count narrowed by a large key list.
 *
 * `head: true` is immune to the row cap but NOT to the URL length limit, so
 * an exact count filtered by thousands of ids still fails as a single
 * request. Counts are summed across chunks, which is exact here because the
 * chunks partition the key set and every row matches exactly one key.
 *
 * `null` keys means the scope filter is inactive — see fetchAllIn.
 */
export function countRowsIn<K>(
  keys: readonly K[],
  query: ChunkCount<K>,
  opts?: { chunkSize?: number }
): Promise<number>;
export function countRowsIn<K>(
  keys: readonly K[] | null,
  query: ScopeCount<K>,
  opts?: { chunkSize?: number }
): Promise<number>;
export async function countRowsIn<K>(
  keys: readonly K[] | null,
  query: ChunkCount<K> | ScopeCount<K>,
  opts: { chunkSize?: number } = {}
): Promise<number> {
  // See the matching cast in fetchAllIn — the overloads guarantee `query`
  // accepts null on this branch.
  if (keys === null) return countRows((query as ScopeCount<K>)(null));

  const unique = [...new Set(keys)];
  if (unique.length === 0) return 0;

  const chunkSize = Math.max(1, opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
  let total = 0;
  for (let i = 0; i < unique.length; i += chunkSize) {
    total += await countRows(query(unique.slice(i, i + chunkSize)));
  }
  return total;
}

/**
 * True row count, straight from the database.
 *
 * `head: true` sends no rows at all, so the row cap cannot apply — this is
 * always right and always cheaper than counting a fetched array. Reach for it
 * whenever only a total is wanted.
 *
 *     const total = await countRows(
 *       supabase.from("leads").select("id", { count: "exact", head: true })
 *     );
 */
export async function countRows(
  query: PromiseLike<{ count: number | null; error: PostgrestError | null }>
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.error("[countRows]", error.message);
    return 0;
  }
  return count ?? 0;
}
