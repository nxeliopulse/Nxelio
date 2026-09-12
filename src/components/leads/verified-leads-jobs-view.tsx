"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Loader2, CheckCircle2, XCircle, ArrowLeft, MailCheck, ShoppingCart, Search, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import {
  listLeadSearchJobs, getLeadSearchJob, markLeadSearchJobImported,
  type LeadSearchJobSummary, type LeadSearchJobDetail,
} from "@/lib/leads/lead-search-jobs";
import { importGeneratedProspects } from "@/lib/leads/buy-leads";
import { BuyReview } from "@/components/leads/add-leads-wizard";
import { notifyCreditsChanged } from "@/lib/credits-refresh";

const STATUS_META = {
  pending: { label: "Queued", variant: "default" as const, icon: Clock },
  running: { label: "Searching…", variant: "info" as const, icon: Loader2 },
  done: { label: "Ready", variant: "success" as const, icon: CheckCircle2 },
  failed: { label: "Couldn't finish", variant: "danger" as const, icon: XCircle },
};

// Background jobs only ever use a real provider (never the AI-sample
// fallback — runSearchRound() returns an error instead of falling back), so
// this always resolves to the "Purchased Leads" label in importGeneratedProspects().
const JOB_RESULT_SOURCE = "anysite" as const;

function StatusBadge({ status }: { status: LeadSearchJobSummary["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <Icon className={status === "running" ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {meta.label}
    </Badge>
  );
}

export function VerifiedLeadsJobsView({ initialJobs }: { initialJobs: LeadSearchJobSummary[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadSearchJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importing, startImport] = useTransition();
  const { toast } = useFeedback();

  // Poll while anything is still queued/searching so the page updates itself
  // without the user needing to refresh — this is the whole point of the
  // "walk away, come back later" flow.
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "running");
    if (!hasActive) return;
    const t = setInterval(() => {
      listLeadSearchJobs().then(setJobs).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [jobs]);

  function openJob(id: string) {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    getLeadSearchJob(id)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }

  function runImport() {
    if (!detail) return;
    startImport(async () => {
      const res = await importGeneratedProspects(detail.results, JOB_RESULT_SOURCE, detail.id);
      if (!res.ok) { toast(res.error || "Import failed", "error"); return; }
      toast(
        `Imported ${res.inserted} lead${res.inserted === 1 ? "" : "s"}${res.duplicates ? ` — ${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"} skipped` : ""}.`,
        "success"
      );
      if (res.inserted > 0) notifyCreditsChanged();
      setImportedIds((s) => new Set(s).add(detail.id));
      markLeadSearchJobImported(detail.id).catch(() => {});
      setOpenId(null);
    });
  }

  // A job already imported in an earlier visit has this set server-side
  // (markLeadSearchJobImported) — importedIds only covers imports done in
  // THIS page load, so relying on it alone reverted to "Review & import"
  // for anything imported before the last refresh. Real persisted state wins.
  function isImported(job: Pick<LeadSearchJobSummary, "id" | "importedAt">): boolean {
    return Boolean(job.importedAt) || importedIds.has(job.id);
  }

  const openSummary = jobs.find((j) => j.id === openId);

  if (openId && openSummary) {
    const alreadyImported = isImported(openSummary);
    return (
      <div className="max-w-[1200px] mx-auto w-full pb-28">
        <button onClick={() => setOpenId(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Purchased Leads
        </button>
        <div className="flex items-center gap-3 mb-4">
          <span className="h-10 w-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="h-4.5 w-4.5" />
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex-1">
            {openSummary.foundCount} of {openSummary.requestedCount} requested
          </h1>
          <StatusBadge status={openSummary.status} />
        </div>
        {openSummary.note && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
            {openSummary.note}
          </div>
        )}
        {detailLoading || !detail ? (
          <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
          </div>
        ) : detail.results.length === 0 ? (
          <p className="text-slate-500 py-12 text-center">No results yet.</p>
        ) : (
          <>
            <BuyReview prospects={detail.results} criteria={detail.criteria} />
            <div className="mt-4 flex justify-end">
              <Button onClick={runImport} disabled={importing || alreadyImported}>
                {alreadyImported
                  ? <><CheckCircle2 className="h-4 w-4" /> Imported</>
                  : importing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                  : <>Import {detail.results.length} lead{detail.results.length === 1 ? "" : "s"}</>}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const readyCount = jobs.filter((j) => j.status === "done" && !isImported(j)).length;
  const totalFound = jobs.reduce((sum, j) => sum + j.foundCount, 0);
  const importedCount = jobs.filter((j) => isImported(j)).length;

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-28">
      <Link href="/leads" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Prospects
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Purchased Leads</h1>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Background searches queued from the Verified Emails source — they finish here, no matter how long they take.</p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-slate-500">
          <MailCheck className="h-8 w-8 text-slate-300" />
          <p>No background searches yet. Choose &quot;Run in background &amp; email me&quot; on the Verified Emails source to queue one.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="p-4 flex items-center gap-3 bg-amber-500/[0.04] dark:bg-amber-500/[0.08]">
              <span className="h-11 w-11 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0"><Search className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500">Total searches</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{jobs.length}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3 bg-indigo-500/[0.04] dark:bg-indigo-500/[0.08]">
              <span className="h-11 w-11 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0"><CheckCircle2 className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500">Ready to import</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{readyCount}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3 bg-blue-500/[0.04] dark:bg-blue-500/[0.08]">
              <span className="h-11 w-11 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0"><Users2 className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500">Leads found</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{totalFound}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]">
              <span className="h-11 w-11 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"><MailCheck className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500">Imported</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{importedCount}</p>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px] text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-xs text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Criteria</th>
                    <th className="px-4 py-3 font-semibold">Requested</th>
                    <th className="px-4 py-3 font-semibold">Found</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Requested on</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {jobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2.5">
                          <span className="h-8 w-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                            <ShoppingCart className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="font-medium text-slate-900 dark:text-white">{[j.criteria.role, j.criteria.industry].filter(Boolean).join(" · ") || "Any"}</span>
                            {j.criteria.locations?.length ? <span className="text-slate-400"> · {j.criteria.locations.join(", ")}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs">
                          {j.requestedCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold text-xs border border-emerald-200/50 dark:border-emerald-900/50">
                          {j.foundCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={j.status} />
                        {(j.status === "pending" || j.status === "running") && j.timeEstimate && (
                          <div className="text-[11px] text-slate-400 mt-1">usually {j.timeEstimate}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">{new Date(j.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end">
                          {j.status === "done" && (
                            <Button
                              size="sm"
                              variant={isImported(j) ? "outline" : "primary"}
                              onClick={() => openJob(j.id)}
                              className={isImported(j) ? "min-w-[110px] justify-center" : "min-w-[130px] justify-center shadow-xs"}
                            >
                              {isImported(j) ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 mr-1.5" />
                                  View
                                </>
                              ) : (
                                "Review & import"
                              )}
                            </Button>
                          )}
                          {j.status === "failed" && (
                            <Button size="sm" variant="outline" onClick={() => openJob(j.id)} className="min-w-[100px] justify-center">
                              View
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
