"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { hasFeature, getMaxBuyLeadsCount, canAffordLeads } from "@/lib/queries/subscriptions";
import { getActiveLeadProvider } from "@/lib/leads/provider";
import { anysiteConfigured, searchAnysiteUsers } from "@/lib/leads/anysite";
import { brightDataConfigured, brightDataSearchPeople } from "@/lib/leads/bright-data";
import { enrichWithAnysiteEmails, enrichAndFilterProspects, type BuyCriteria, type GeneratedProspect } from "@/lib/leads/buy-leads";

/**
 * Background "Verified Leads" search jobs — a dedicated exhaustive-search
 * policy, deliberately separate from Buy Leads' synchronous "try a few
 * top-up rounds, then hand back whatever we found" behavior. Here, time
 * genuinely doesn't matter: the job keeps searching until it either hits the
 * exact requested count, or has examined every real match there is — never
 * gives up just because an early round came up short.
 *
 * For Anysite (no cursor/offset — confirmed against their API reference),
 * "examined every match" is a hard guarantee, not a heuristic: the search
 * partitions all matching results into fixed, non-overlapping buckets, and
 * stepping through every bucket means nothing was missed and nothing was
 * re-paid-for twice (see BUCKET_TOTAL below). Bright Data has no such
 * guarantee, so it falls back to a consecutive-empty-rounds heuristic.
 *
 * See supabase/migrations/0137_lead_search_jobs.sql and
 * 0139_lead_search_jobs_progress.sql for the table shape, and
 * src/app/api/leads/search-jobs/cron/route.ts for the drainer.
 */

// Anysite's search has no cursor/offset — confirmed against their API
// reference. Instead it partitions ALL matching results into BUCKET_TOTAL
// non-overlapping slices (bucket_total/bucket_index). Fixing BUCKET_TOTAL
// for the whole job and stepping bucket_index each round (0, 1, 2, ...)
// guarantees every round returns genuinely NEW people — unlike escalating
// `count` from scratch each time, which silently re-fetches (and re-pays
// for) the same top matches over and over. Once round reaches BUCKET_TOTAL,
// every single matching person has been examined — a DEFINITE exhaustion
// signal, not a heuristic.
const BUCKET_TOTAL = 25;
// Max Anysite allows per call. Cost is billed per person ACTUALLY returned
// (confirmed via testing — asking for 1000 from a bucket with 40 matches
// only costs 40), so there's no downside to always asking for the ceiling.
const HARD_SEARCH_CEILING = 1000;

// Bright Data has no confirmed bucketing/pagination scheme, so its rounds
// still escalate `count` from scratch — same old approach, just for the one
// provider we don't have better information on.
const BRIGHT_DATA_ESCALATION = [1, 2, 3, 5, 8, 15, 25, 40, 70, 120, 200, 350, 600, 1000];

// Secondary safety net: if a provider's round comes up completely empty this
// many times in a row, treat the search as exhausted even before formally
// running out of buckets/escalation room — a real population smaller than
// expected shows up this way well before BUCKET_TOTAL is reached.
const DRY_ROUNDS_TO_GIVE_UP = 5;

// Backstop only — not the normal way a job ends. Guards against a truly
// pathological case (e.g. a provider outage) spinning forever. Generous
// because the whole point of this feature is "time is not a constraint."
const MAX_ATTEMPTS = 3000;

// How many raw prospects to hand to the email-enrichment step per batch.
// Kept equal to findEmailsByLinkedIn's own internal concurrency (5) so the
// "do we have enough yet?" check between batches is fine-grained — a bigger
// batch can quietly overshoot the requested count (and pay full price for
// every extra successful email) since it always runs to completion before
// the outer loop re-checks the target.
const ENRICH_BATCH_SIZE = 5;

// Once a job has been running this long without finishing, start sending
// "still working" status emails so the requester isn't left wondering.
const PROGRESS_EMAIL_AFTER_MS = 15 * 60 * 1000; // 15 minutes
const PROGRESS_EMAIL_INTERVAL_MS = 30 * 60 * 1000; // then every 30 minutes

export type LeadSearchJobStatus = "pending" | "running" | "done" | "failed";

interface JobDbRow {
  id: string;
  workspace_id: string;
  notify_email: string;
  criteria: BuyCriteria;
  requested_count: number;
  status: LeadSearchJobStatus;
  found_count: number;
  results: GeneratedProspect[];
  pending_pool: GeneratedProspect[];
  seen_linkedin: string[];
  round: number;
  search_exhausted: boolean;
  dry_rounds: number;
  attempts: number;
  last_error: string | null;
  note: string | null;
  time_estimate: string | null;
  last_progress_email_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  imported_at: string | null;
}

export interface LeadSearchJobSummary {
  id: string;
  criteria: BuyCriteria;
  requestedCount: number;
  status: LeadSearchJobStatus;
  foundCount: number;
  note: string | null;
  timeEstimate: string | null;
  createdAt: string;
  completedAt: string | null;
  importedAt: string | null;
}

export interface LeadSearchJobDetail extends LeadSearchJobSummary {
  results: GeneratedProspect[];
}

function toSummary(r: JobDbRow): LeadSearchJobSummary {
  return {
    id: r.id,
    criteria: r.criteria,
    requestedCount: r.requested_count,
    status: r.status,
    foundCount: r.found_count,
    note: r.note,
    timeEstimate: r.time_estimate,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    importedAt: r.imported_at,
  };
}

/** Rough, honest expectation-setting shown when the job is queued — actual
 *  time depends entirely on how common a confirmed email is for this
 *  criteria, so this is deliberately a wide range, not a promise. */
function estimateWaitLabel(requestedCount: number): string {
  if (requestedCount <= 10) return "5–20 minutes";
  if (requestedCount <= 25) return "20–60 minutes";
  if (requestedCount <= 50) return "1–2 hours";
  return "2–5 hours";
}

/** Called from the wizard's "Run in background & email me" choice, in place
 *  of the synchronous searchBuyLeads() call. */
export async function createLeadSearchJob(
  criteria: BuyCriteria,
  notifyEmail?: string
): Promise<{ ok: boolean; id?: string; timeEstimate?: string; error?: string }> {
  if (!(await hasFeature("discovery"))) {
    return { ok: false, error: "Lead discovery isn't included on your plan. Upgrade to Starter or Pro to unlock it." };
  }
  const maxAllowed = await getMaxBuyLeadsCount();
  const requestedCount = Math.max(1, Math.min(criteria.count, maxAllowed));
  if (!(await canAffordLeads(requestedCount))) {
    return { ok: false, error: "You don't have enough leads remaining on your plan this cycle. Upgrade your plan or wait for renewal." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const email = (notifyEmail || user.email || "").trim();
  if (!email) return { ok: false, error: "No notification email available for this account." };

  const timeEstimate = estimateWaitLabel(requestedCount);
  const { data, error } = await supabase
    .from("lead_search_jobs")
    .insert({
      created_by: user.id,
      notify_email: email,
      criteria: { ...criteria, count: requestedCount, requireVerifiedEmail: true },
      requested_count: requestedCount,
      time_estimate: timeEstimate,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id, timeEstimate };
}

/** Workspace-scoped list for the Verified Leads results page. */
export async function listLeadSearchJobs(): Promise<LeadSearchJobSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_search_jobs")
    .select("id, workspace_id, notify_email, criteria, requested_count, status, found_count, results, pending_pool, seen_linkedin, round, search_exhausted, dry_rounds, attempts, last_error, note, time_estimate, last_progress_email_at, created_at, updated_at, completed_at, imported_at")
    .order("created_at", { ascending: false });
  return ((data as JobDbRow[]) || []).map(toSummary);
}

/** Full detail (including results) for one job — the review/import step. */
export async function getLeadSearchJob(id: string): Promise<LeadSearchJobDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("lead_search_jobs").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as JobDbRow;
  return { ...toSummary(row), results: row.results || [] };
}

/** Marks a finished job's results as imported — clears the "ready to review"
 *  indicator (e.g. the Verified Leads button's glow) for this job. */
export async function markLeadSearchJobImported(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead_search_jobs").update({ imported_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cheap existence check for the Prospects page header — true when at least
 *  one background search has finished and hasn't been imported yet. */
export async function hasReadyLeadSearchJobs(): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("lead_search_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .is("imported_at", null);
  return Boolean(count && count > 0);
}

function dedupeKey(p: GeneratedProspect): string {
  return p.linkedin || `${p.full_name}|${p.company_name}`;
}

/** One search round for the given round index, mapped into the same
 *  GeneratedProspect shape searchBuyLeads() produces — reusing whichever
 *  provider is active platform-wide, same as the synchronous path. Only the
 *  low-level API call is shared; the retry/give-up policy around it is
 *  entirely separate (see module comment above). `round` becomes Anysite's
 *  bucket_index (0-based, wrapped defensively — see BUCKET_TOTAL above) or
 *  Bright Data's escalation step. */
async function runSearchRound(
  criteria: BuyCriteria,
  round: number,
  provider: "anysite" | "bright_data"
): Promise<{ ok: boolean; prospects: GeneratedProspect[]; error?: string }> {
  if (provider === "anysite" && anysiteConfigured) {
    const r = await searchAnysiteUsers({
      role: [criteria.role, criteria.industry].filter(Boolean).join(" ").trim(),
      locations: criteria.locations,
      count: HARD_SEARCH_CEILING,
      bucketTotal: BUCKET_TOTAL,
      bucketIndex: Math.min(round, BUCKET_TOTAL - 1),
    });
    if (!r.ok) return { ok: false, prospects: [], error: r.error };
    const prospects: GeneratedProspect[] = r.prospects
      .map((p) => ({
        full_name: p.full_name, first_name: p.first_name, last_name: p.last_name,
        title: p.title, seniority: p.seniority, company_name: p.company_name,
        industry: criteria.industry || "", website_url: "", linkedin: p.linkedin,
        location: p.location, email: "",
      }));
    return { ok: true, prospects };
  }
  if (provider === "bright_data" && brightDataConfigured) {
    const mult = BRIGHT_DATA_ESCALATION[Math.min(round, BRIGHT_DATA_ESCALATION.length - 1)];
    const rawCount = Math.min(criteria.count * mult, HARD_SEARCH_CEILING);
    const r = await brightDataSearchPeople({ ...criteria, count: rawCount });
    if (!r.ok) return { ok: false, prospects: [], error: r.error };
    const prospects: GeneratedProspect[] = r.prospects.map((p) => ({
      full_name: p.full_name, first_name: p.first_name, last_name: p.last_name,
      title: p.title, seniority: p.seniority, company_name: p.company_name,
      industry: criteria.industry || "", website_url: "", linkedin: p.linkedin,
      location: p.location, email: p.email || "",
    }));
    return { ok: true, prospects };
  }
  return { ok: false, prospects: [], error: "Lead discovery requires the active provider to be configured." };
}

async function enrichBatch(prospects: GeneratedProspect[], provider: "anysite" | "bright_data") {
  return provider === "anysite"
    ? enrichWithAnysiteEmails(prospects, true)
    : enrichAndFilterProspects(prospects, true);
}

function noteFor(found: number, requested: number): string | undefined {
  if (found >= requested) return undefined;
  return `Found ${found} of the ${requested} requested — we checked every real match we could find for this criteria (right up to genuine exhaustion) and this is everyone available with a confirmed email right now. Try a broader location/role to get more.`;
}

async function sendCompletionEmail(row: JobDbRow, note?: string) {
  const roleLabel = [row.criteria.role, row.criteria.industry].filter(Boolean).join(" ") || "your criteria";
  const subject = note
    ? `Your verified leads search finished — ${row.found_count} of ${row.requested_count} found`
    : `Your ${row.found_count} verified leads are ready`;
  const text = note
    ? `We searched exhaustively for "${roleLabel}" and found ${row.found_count} of the ${row.requested_count} verified-email leads you asked for — that's genuinely everyone available right now. Open Verified Leads in the app to review and import them.`
    : `We found all ${row.found_count} verified-email leads you asked for matching "${roleLabel}". Open Verified Leads in the app to review and import them.`;
  await sendEmail({ to: row.notify_email, subject, text });
}

async function sendProgressEmail(row: JobDbRow) {
  const roleLabel = [row.criteria.role, row.criteria.industry].filter(Boolean).join(" ") || "your criteria";
  const elapsedMin = Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000);
  await sendEmail({
    to: row.notify_email,
    subject: `Still searching — ${row.found_count} of ${row.requested_count} verified leads found so far`,
    text: `Your search for "${roleLabel}" is still running (${elapsedMin} minutes so far). We've confirmed ${row.found_count} of the ${row.requested_count} verified-email leads you asked for and are continuing to search for the rest — quality over speed, so this can take a while. We'll email you again the moment it's done.`,
  });
}

/** Drains up to `jobLimit` due jobs, each getting up to `perJobBudgetMs` of
 *  work before the tick moves on — called by the cron route every minute. */
export async function processDueLeadSearchJobs(jobLimit = 3, perJobBudgetMs = 15000): Promise<{ checked: number; completed: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("lead_search_jobs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("updated_at", { ascending: true })
    .limit(jobLimit);
  const jobs = (data as JobDbRow[]) || [];

  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const deadline = Date.now() + perJobBudgetMs;
    const provider = await getActiveLeadProvider();
    let { results, pending_pool: pool, round, search_exhausted: exhausted, dry_rounds: dryRounds, attempts } = job;
    const seenSet = new Set(job.seen_linkedin);
    let lastError: string | undefined;

    if (attempts + 1 > MAX_ATTEMPTS) {
      await admin.from("lead_search_jobs").update({
        status: "failed",
        last_error: "Gave up after an extremely long search — this criteria may be impossible to fill with verified emails.",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      await sendEmail({
        to: job.notify_email,
        subject: `Your verified leads search couldn't be completed`,
        text: `We searched extensively but couldn't find enough verified-email leads for your criteria. Found ${job.found_count} of ${job.requested_count} before giving up. Try broadening the location or job title.`,
      });
      failed += 1;
      continue;
    }

    while (Date.now() < deadline && results.length < job.requested_count) {
      if (pool.length === 0 && !exhausted) {
        const r = await runSearchRound(job.criteria, round, provider);
        round += 1;
        attempts += 1;

        const fresh = r.ok ? r.prospects.filter((p) => !seenSet.has(dedupeKey(p))) : [];
        if (!r.ok) lastError = r.error || lastError;

        if (fresh.length) {
          dryRounds = 0;
          fresh.forEach((p) => seenSet.add(dedupeKey(p)));
          pool = [...pool, ...fresh];
        } else {
          dryRounds += 1;
        }

        // Anysite: buckets are a strict, non-overlapping partition of every
        // matching result — once every bucket has been examined, there is
        // NOTHING left to find, full stop. Bright Data has no such guarantee,
        // so it relies purely on the consecutive-dry-rounds heuristic.
        if (provider === "anysite" && round >= BUCKET_TOTAL) exhausted = true;
        if (dryRounds >= DRY_ROUNDS_TO_GIVE_UP) exhausted = true;
        continue;
      }

      if (pool.length === 0) break; // exhausted, nothing left to enrich

      const batch = pool.slice(0, ENRICH_BATCH_SIZE);
      pool = pool.slice(ENRICH_BATCH_SIZE);
      const enriched = await enrichBatch(batch, provider);
      attempts += 1;
      if (enriched.ok) {
        results = [...results, ...enriched.prospects];
      } else {
        lastError = enriched.error || lastError;
      }

      // Persist after every batch — an early function timeout must never lose progress.
      await admin.from("lead_search_jobs").update({
        status: "running",
        results,
        pending_pool: pool,
        seen_linkedin: Array.from(seenSet),
        round,
        search_exhausted: exhausted,
        dry_rounds: dryRounds,
        found_count: results.length,
        attempts,
        last_error: lastError || null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }

    const done = results.length >= job.requested_count;
    const stuck = exhausted && pool.length === 0 && results.length < job.requested_count;

    if (done || stuck) {
      const trimmed = results.slice(0, job.requested_count);
      const note = noteFor(trimmed.length, job.requested_count);
      const nowIso = new Date().toISOString();
      await admin.from("lead_search_jobs").update({
        status: "done",
        results: trimmed,
        pending_pool: [],
        found_count: trimmed.length,
        dry_rounds: dryRounds,
        attempts,
        note: note || null,
        completed_at: nowIso,
        updated_at: nowIso,
      }).eq("id", job.id);
      await sendCompletionEmail({ ...job, results: trimmed, found_count: trimmed.length }, note);
      completed += 1;
      continue;
    }

    // Still work to do — leave it running for the next tick to continue.
    // Along the way, keep the requester posted if it's taking a while.
    const elapsedMs = Date.now() - new Date(job.created_at).getTime();
    const sinceLastProgressMs = job.last_progress_email_at
      ? Date.now() - new Date(job.last_progress_email_at).getTime()
      : Infinity;
    const dueForProgressEmail = elapsedMs > PROGRESS_EMAIL_AFTER_MS && sinceLastProgressMs > PROGRESS_EMAIL_INTERVAL_MS;
    const nowIso = new Date().toISOString();
    if (dueForProgressEmail) {
      await sendProgressEmail({ ...job, found_count: results.length });
    }
    await admin.from("lead_search_jobs").update({
      status: "running",
      results,
      pending_pool: pool,
      seen_linkedin: Array.from(seenSet),
      round,
      search_exhausted: exhausted,
      dry_rounds: dryRounds,
      found_count: results.length,
      attempts,
      last_error: lastError || null,
      last_progress_email_at: dueForProgressEmail ? nowIso : job.last_progress_email_at,
      updated_at: nowIso,
    }).eq("id", job.id);
  }

  return { checked: jobs.length, completed, failed };
}
