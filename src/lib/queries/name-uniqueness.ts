import type { SupabaseClient } from "@supabase/supabase-js";

interface ResolveUniqueNameOptions {
  table: string;
  column: string;
  desiredName: string | null | undefined;
  /** Base name used when `desiredName` is blank, e.g. an email template's
   *  name — numbered like "Base(1)", "Base(2)" until a free one is found. */
  fallbackBase: string;
  /** Excludes this row's own current name when checking (edits). */
  excludeId?: string;
  /** Used in the error message, e.g. "campaign" → `A campaign named "X"...`. */
  label: string;
  /** When true, a collision on a provided `desiredName` is silently resolved
   *  with a "(n)" suffix instead of being rejected — for names the system
   *  generates on the user's behalf rather than ones they typed themselves. */
  autoUnique?: boolean;
}

export type ResolveUniqueNameResult = { ok: true; name: string } | { ok: false; error: string };

function nextAvailable(base: string, taken: Set<string>): string {
  let n = 1;
  let candidate = `${base}(${n})`;
  while (taken.has(candidate.toLowerCase())) {
    n++;
    candidate = `${base}(${n})`;
  }
  return candidate;
}

/**
 * Resolves the name to actually save for a campaign/segment/etc: blocks a
 * name that collides (case-insensitively) with an existing row, or — when
 * left blank — generates one from `fallbackBase` numbered to be unique.
 *
 * Returns a result instead of throwing: a name collision is an expected,
 * user-facing outcome, and a Server Action invoked directly from a client
 * event handler (not a <form action>) surfaces a thrown Error here as a
 * raw HTTP 500 rather than a friendly rejected promise — the caller needs
 * a plain value to check and show to the user instead.
 */
export async function resolveUniqueName(supabase: SupabaseClient, opts: ResolveUniqueNameOptions): Promise<ResolveUniqueNameResult> {
  const { table, column, desiredName, fallbackBase, excludeId, label, autoUnique } = opts;
  const { data } = await supabase.from(table).select(`id, ${column}`);
  const rows = ((data as Record<string, unknown>[] | null) || []).filter((r) => !excludeId || r.id !== excludeId);
  const taken = new Set(rows.map((r) => String(r[column] ?? "").trim().toLowerCase()));

  const trimmed = (desiredName || "").trim();
  if (trimmed) {
    if (!taken.has(trimmed.toLowerCase())) return { ok: true, name: trimmed };
    if (autoUnique) return { ok: true, name: nextAvailable(trimmed, taken) };
    return { ok: false, error: `A ${label} named "${trimmed}" already exists. Please choose a different name.` };
  }

  return { ok: true, name: nextAvailable((fallbackBase || "Untitled").trim(), taken) };
}
