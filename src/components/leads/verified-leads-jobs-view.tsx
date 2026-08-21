"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Loader2, CheckCircle2, XCircle, ArrowLeft, MailCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  listLeadSearchJobs, getLeadSearchJob,
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
      const res = await importGeneratedProspects(detail.results, JOB_RESULT_SOURCE);
      if (!res.ok) { toast(res.error || "Import failed", "error"); return; }
      toast(
        `Imported ${res.inserted} lead${res.inserted === 1 ? "" : "s"}${res.duplicates ? ` — ${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"} skipped` : ""}.`,
        "success"
      );
      if (res.inserted > 0) notifyCreditsChanged();
      setImportedIds((s) => new Set(s).add(detail.id));
      setOpenId(null);
    });
  }

  const openSummary = jobs.find((j) => j.id === openId);

  if (openId && openSummary) {
    const alreadyImported = importedIds.has(openId);
    return (
      <div className="max-w-[1200px] mx-auto w-full">
        <button onClick={() => setOpenId(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Verified Leads
        </button>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
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

  return (
    <div className="max-w-[1200px] mx-auto w-full">
      <Link href="/leads" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Prospects
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Verified Leads</h1>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Background searches queued from the Verified Emails source — they finish here, no matter how long they take.</p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-slate-500">
          <MailCheck className="h-8 w-8 text-slate-300" />
          <p>No background searches yet. Choose &quot;Run in background &amp; email me&quot; on the Verified Emails source to queue one.</p>
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Criteria</th>
                <th className="px-4 py-2.5 text-left font-semibold">Requested</th>
                <th className="px-4 py-2.5 text-left font-semibold">Found</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Requested on</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {[j.criteria.role, j.criteria.industry].filter(Boolean).join(" · ") || "Any"}
                    {j.criteria.locations?.length ? <span className="text-slate-400"> · {j.criteria.locations.join(", ")}</span> : null}
                  </td>
                  <td className="px-4 py-3">{j.requestedCount}</td>
                  <td className="px-4 py-3">{j.foundCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={j.status} />
                    {(j.status === "pending" || j.status === "running") && j.timeEstimate && (
                      <div className="text-[11px] text-slate-400 mt-1">usually {j.timeEstimate}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(j.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {j.status === "done" && (
                      <Button size="sm" variant="outline" onClick={() => openJob(j.id)}>
                        {importedIds.has(j.id) ? "View" : "Review & import"}
                      </Button>
                    )}
                    {j.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => openJob(j.id)}>View</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
