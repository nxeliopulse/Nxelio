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
 * genuinely doesn't matter: the job keeps widening its search until it
 * either hits the exact requested count, or has proven the pool is really
 * empty (several rounds in a row at the largest search size, finding nobody
 * new) — never gives up just because an early round came up short. See
 * supabase/migrations/0137_lead_search_jobs.sql and
 * 0139_lead_search_jobs_progress.sql for the table shape, and
 * src/app/api/leads/search-jobs/cron/route.ts for the drainer.
 */

// How large a single search round can get. NOT tied to the workspace's
// lead-credit balance — that balance limits how many leads you can IMPORT,
// it has nothing to do with how many candidates a search may examine while
// hunting for enough confirmed emails. This ceiling instead matches the
// search provider's own realistic per-request size (see anysite.ts).
const HARD_SEARCH_CEILING = 1000;

// Each round asks for requestedCount * this multiplier (capped at the
// ceiling above) — escalates far past Buy Leads' [1,2,3,5] because a
// background job has no reason to stop early.
const ESCALATION = [1, 2, 3, 5, 8, 15, 25, 40, 70, 120, 200, 350, 600, 1000];
function roundSize(round: number, requestedCount: number): number {
  const mult = ESCALATION[Math.min(round, ESCALATION.length - 1)];
  return Math.min(requestedCount * mult, HARD_SEARCH_CEILING);
}

// "Genuinely exhausted" means: already searching at the hard ceiling, AND
// this many rounds in a row turned up not one single new candidate. Only
// then do we accept a partial result — never after just one thin round.
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
    .select("id, workspace_id, notify_email, criteria, requested_count, status, found_count, results, pending_pool, seen_linkedin, round, search_exhausted, dry_rounds, attempts, last_error, note, time_estimate, last_progress_email_at, created_at, updated_at, completed_at")
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

function dedupeKey(p: GeneratedProspect): string {
  return p.linkedin || `${p.full_name}|${p.company_name}`;
}

/** One search round at the given raw count, mapped into the same
 *  GeneratedProspect shape searchBuyLeads() produces — reusing whichever
 *  provider is active platform-wide, same as the synchronous path. Only the
 *  low-level API call is shared; the retry/give-up policy around it is
 *  entirely separate (see module comment above). */
async function runSearchRound(
  criteria: BuyCriteria,
  rawCount: number,
  provider: "anysite" | "bright_data"
): Promise<{ ok: boolean; prospects: GeneratedProspect[]; error?: string }> {
  if (provider === "anysite" && anysiteConfigured) {
    const r = await searchAnysiteUsers({ role: [criteria.role, criteria.industry].filter(Boolean).join(" ").trim(), locations: criteria.locations, count: rawCount });
    if (!r.ok) return { ok: false, prospects: [], error: r.error };
    const prospects: GeneratedProspect[] = r.prospects
      .filter((p) => !criteria.seniority || criteria.seniority === "Any" || p.seniority === criteria.seniority)
      .map((p) => ({
        full_name: p.full_name, first_name: p.first_name, last_name: p.last_name,
        title: p.title, seniority: p.seniority, company_name: p.company_name,
        industry: criteria.industry || "", website_url: "", linkedin: p.linkedin,
        location: p.location, email: "",
      }));
    return { ok: true, prospects };
  }
  if (provider === "bright_data" && brightDataConfigured) {
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
  return `Found ${found} of the ${requested} requested. We searched up to ${HARD_SEARCH_CEILING} candidates and ${DRY_ROUNDS_TO_GIVE_UP} rounds in a row turned up nobody new with a confirmed email — that's genuinely everyone available for this criteria right now. Try a broader location/role to get more.`;
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
        const rawCount = roundSize(round, job.requested_count);
        const atCeiling = rawCount >= HARD_SEARCH_CEILING;
        const r = await runSearchRound(job.criteria, rawCount, provider);
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
          if (atCeiling && dryRounds >= DRY_ROUNDS_TO_GIVE_UP) exhausted = true;
        }
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
