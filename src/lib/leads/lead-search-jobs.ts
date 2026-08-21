"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { hasFeature, getMaxBuyLeadsCount, canAffordLeads } from "@/lib/queries/subscriptions";
import { getActiveLeadProvider } from "@/lib/leads/provider";
import { anysiteConfigured, searchAnysiteUsers } from "@/lib/leads/anysite";
import { brightDataConfigured, brightDataSearchPeople } from "@/lib/leads/bright-data";
import { enrichWithAnysiteEmails, enrichAndFilterProspects, type BuyCriteria, type GeneratedProspect } from "@/lib/leads/buy-leads";

/**
 * Background "Verified Leads" search jobs — lets a request for N verified-
 * email prospects run across many cron ticks instead of blocking one HTTP
 * request. See supabase/migrations/0137_lead_search_jobs.sql for the table
 * shape and src/app/api/leads/search-jobs/cron/route.ts for the drainer.
 */

// Escalates further than the inline wizard's [1,2,3,5] top-up — a background
// job has no request-timeout pressure, so "must hit the requested count"
// means trying broader rounds before giving up, not stopping early.
const TOPUP_MULTIPLIERS = [1, 2, 3, 5, 8, 12, 20];
function multiplierForRound(round: number): number {
  return TOPUP_MULTIPLIERS[Math.min(round, TOPUP_MULTIPLIERS.length - 1)];
}

// Ticks run every minute; this is how many consecutive ticks a job may sit
// in 'running' without finishing before we give up on it — a safety valve
// against spinning forever on an impossible criteria combination.
const MAX_ATTEMPTS = 200;

// How many raw prospects to hand to the email-enrichment step per batch —
// small enough that one batch reliably finishes well inside a single tick.
const ENRICH_BATCH_SIZE = 15;

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
  attempts: number;
  last_error: string | null;
  note: string | null;
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
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

/** Called from the wizard's "Run in background & email me" choice, in place
 *  of the synchronous searchBuyLeads() call. */
export async function createLeadSearchJob(
  criteria: BuyCriteria,
  notifyEmail?: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
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

  const { data, error } = await supabase
    .from("lead_search_jobs")
    .insert({
      created_by: user.id,
      notify_email: email,
      criteria: { ...criteria, count: requestedCount, requireVerifiedEmail: true },
      requested_count: requestedCount,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Workspace-scoped list for the Verified Leads results page. */
export async function listLeadSearchJobs(): Promise<LeadSearchJobSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_search_jobs")
    .select("id, workspace_id, notify_email, criteria, requested_count, status, found_count, results, pending_pool, seen_linkedin, round, search_exhausted, attempts, last_error, note, created_at, updated_at, completed_at")
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

/** Workspace-scoped equivalent of getMaxBuyLeadsCount(), usable from the
 *  admin (session-less) client the cron worker runs under. */
async function getMaxAllowedForWorkspace(admin: ReturnType<typeof createAdminClient>, workspaceId: string): Promise<number> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("leads_remaining, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub || (sub.status !== "active" && sub.status !== "trialing")) return 100;
  return Math.max(1, Math.min(100, sub.leads_remaining));
}

function dedupeKey(p: GeneratedProspect): string {
  return p.linkedin || `${p.full_name}|${p.company_name}`;
}

/** One search round at the given raw count, mapped into the same
 *  GeneratedProspect shape searchBuyLeads() produces — reusing whichever
 *  provider is active platform-wide, same as the synchronous path. */
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
  return `Found ${found} of the ${requested} requested — that's every real prospect with a verified email matching these criteria right now. Try a broader location/role to get more.`;
}

async function sendCompletionEmail(row: JobDbRow, note?: string) {
  const roleLabel = [row.criteria.role, row.criteria.industry].filter(Boolean).join(" ") || "your criteria";
  const subject = note
    ? `Your verified leads search finished — ${row.found_count} of ${row.requested_count} found`
    : `Your ${row.found_count} verified leads are ready`;
  const text = note
    ? `We searched as broadly as we could for "${roleLabel}" and found ${row.found_count} of the ${row.requested_count} verified-email leads you asked for. Open Verified Leads in the app to review and import them.`
    : `We found all ${row.found_count} verified-email leads you asked for matching "${roleLabel}". Open Verified Leads in the app to review and import them.`;
  await sendEmail({ to: row.notify_email, subject, text });
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
    let { results, pending_pool: pool, round, search_exhausted: exhausted } = job;
    const seenSet = new Set(job.seen_linkedin);
    let lastError: string | undefined;

    if (job.attempts + 1 > MAX_ATTEMPTS) {
      await admin.from("lead_search_jobs").update({
        status: "failed",
        last_error: "Gave up after too many attempts — this criteria may be too narrow to fill with verified emails.",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      await sendEmail({
        to: job.notify_email,
        subject: `Your verified leads search couldn't be completed`,
        text: `We tried repeatedly but couldn't find enough verified-email leads for your criteria. Found ${job.found_count} of ${job.requested_count} before giving up. Try broadening the location or job title.`,
      });
      failed += 1;
      continue;
    }

    while (Date.now() < deadline && results.length < job.requested_count) {
      if (pool.length === 0 && !exhausted) {
        const maxAllowed = await getMaxAllowedForWorkspace(admin, job.workspace_id);
        const rawCount = Math.min(job.requested_count * multiplierForRound(round), maxAllowed);
        const r = await runSearchRound(job.criteria, rawCount, provider);
        round += 1;
        if (!r.ok || !r.prospects.length) {
          lastError = r.error || lastError;
          if (round >= TOPUP_MULTIPLIERS.length) exhausted = true;
          if (rawCount >= maxAllowed) exhausted = true;
          continue;
        }
        const fresh = r.prospects.filter((p) => !seenSet.has(dedupeKey(p)));
        if (!fresh.length) {
          if (round >= TOPUP_MULTIPLIERS.length || rawCount >= maxAllowed) exhausted = true;
          continue;
        }
        fresh.forEach((p) => seenSet.add(dedupeKey(p)));
        pool = [...pool, ...fresh];
        if (rawCount >= maxAllowed) exhausted = true;
        continue;
      }

      if (pool.length === 0) break; // exhausted, nothing left to enrich

      const batch = pool.slice(0, ENRICH_BATCH_SIZE);
      pool = pool.slice(ENRICH_BATCH_SIZE);
      const enriched = await enrichBatch(batch, provider);
      if (enriched.ok) {
        results = [...results, ...enriched.prospects].slice(0, job.requested_count * 2); // keep a small safety margin, trimmed to exact count on completion
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
        found_count: results.length,
        attempts: job.attempts + 1,
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
        found_count: trimmed.length,
        note: note || null,
        completed_at: nowIso,
        updated_at: nowIso,
      }).eq("id", job.id);
      await sendCompletionEmail({ ...job, results: trimmed, found_count: trimmed.length }, note);
      completed += 1;
    } else {
      // Still work to do — leave it running for the next tick to continue.
      await admin.from("lead_search_jobs").update({
        status: "running",
        results,
        pending_pool: pool,
        seen_linkedin: Array.from(seenSet),
        round,
        search_exhausted: exhausted,
        found_count: results.length,
        attempts: job.attempts + 1,
        last_error: lastError || null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }
  }

  return { checked: jobs.length, completed, failed };
}
