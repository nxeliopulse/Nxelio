"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLeadSearchJob, type LeadSearchJobDetail } from "@/lib/leads/lead-search-jobs";

const POLL_INTERVAL_MS = 5000;

type StepState = "done" | "current" | "pending";

/**
 * Three steps derived entirely from real job fields (status/round/found_count
 * from processDueLeadSearchJobs in lib/leads/lead-search-jobs.ts) — no timer,
 * no fake progress. `round` only advances once a search round has actually
 * run, so "scanned profiles" only shows done once that's genuinely true.
 */
function stepStates(job: LeadSearchJobDetail): [StepState, StepState, StepState] {
  if (job.status === "done") return ["done", "done", "done"];
  const scanned: StepState = job.round >= 1 || job.foundCount > 0 ? "done" : job.status === "running" ? "current" : "pending";
  const matching: StepState = scanned === "done" ? (job.status === "running" ? "current" : "pending") : "pending";
  return [scanned, matching, "pending"];
}

function StepRow({ label, state }: { label: string; state: StepState }) {
  return (
    <div className="flex items-center gap-3 py-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      {state === "done" ? (
        <span className="h-7 w-7 rounded-full border-2 border-emerald-500 text-emerald-500 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-4 w-4" />
        </span>
      ) : state === "current" ? (
        <span className="h-7 w-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center flex-shrink-0">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        </span>
      ) : (
        <span className="h-7 w-7 rounded-full border-2 border-slate-200 dark:border-slate-700 text-slate-400 text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {label === "Final list ready for preview" ? 3 : 2}
        </span>
      )}
      <p className={state === "current" ? "font-semibold text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}>
        {label}
      </p>
    </div>
  );
}

export function BuyProgressView({ jobId, initialJob }: { jobId: string; initialJob: LeadSearchJobDetail }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);

  useEffect(() => {
    if (job.status !== "pending" && job.status !== "running") return;
    const t = setInterval(() => {
      getLeadSearchJob(jobId).then((j) => { if (j) setJob(j); }).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [jobId, job.status]);

  const ready = job.status === "done";
  const failed = job.status === "failed";
  const [scanned, matching, finalStep] = stepStates(job);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-6 mb-2">
        {failed ? (
          <span className="h-14 w-14 rounded-full border-2 border-red-400 text-red-400 flex items-center justify-center mb-5">
            <XCircle className="h-6 w-6" />
          </span>
        ) : (
          <span className={`h-14 w-14 rounded-full border-2 flex items-center justify-center mb-5 ${ready ? "border-emerald-500 text-emerald-500" : "border-[var(--primary)] text-[var(--primary)]"}`}>
            {ready ? <CheckCircle2 className="h-6 w-6" /> : <RefreshCw className="h-6 w-6 animate-spin" />}
          </span>
        )}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {failed ? "This search couldn't be completed" : ready ? "Your list is ready" : "Your list is being assembled"}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          {failed
            ? job.note || "We searched extensively but couldn't fill this list. Try broadening the location or job title."
            : ready
            ? `Found ${job.foundCount} of the ${job.requestedCount} requested.${job.note ? ` ${job.note}` : ""}`
            : `Searching for ${job.requestedCount} prospect${job.requestedCount === 1 ? "" : "s"} — usually ${job.timeEstimate || "a while"}, longer if it takes that to fill the list properly. Leave whenever you like; we'll keep going.`}
        </p>
      </div>

      {!failed && (
        <div className="mb-6">
          <StepRow label="Scanned public profiles matching your criteria" state={scanned} />
          <StepRow label="Matching and ranking by seniority" state={matching} />
          <StepRow label="Final list ready for preview" state={finalStep} />
        </div>
      )}

      {!ready && !failed && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 p-4 text-sm text-amber-800 dark:text-amber-400 mb-6">
          We&apos;ll email you the moment it&apos;s ready, and drop a note in the app too. Track it any time under{" "}
          <span className="font-semibold">Purchased Leads</span> in Prospects — no need to keep this tab open.
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
        <Button
          disabled={!ready}
          onClick={() => router.push("/leads/verified-jobs")}
          title={ready ? undefined : "This unlocks once your leads are ready."}
        >
          View leads I&apos;ve bought
        </Button>
      </div>
    </div>
  );
}
