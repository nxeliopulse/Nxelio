"use client";
import { useState, useTransition } from "react";
import { CalendarClock, Video, Mail, Phone, ExternalLink } from "lucide-react";
import { updateDemoRequestStatus, type DemoRequestRow, type DemoRequestStatus } from "@/lib/queries/demo-requests-admin";

const STATUS_STYLE: Record<DemoRequestStatus, string> = {
  new: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  contacted: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  canceled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

const STATUS_LABEL: Record<DemoRequestStatus, string> = {
  new: "New", contacted: "Contacted", completed: "Completed", canceled: "Canceled",
};

const FILTERS: (DemoRequestStatus | "all")[] = ["all", "new", "contacted", "completed", "canceled"];

/** The status each button moves a request TO, per its current status — mirrors
 *  a simple new -> contacted -> completed pipeline, plus cancel from anywhere
 *  that isn't already a terminal state. */
function nextActions(status: DemoRequestStatus): DemoRequestStatus[] {
  switch (status) {
    case "new": return ["contacted", "canceled"];
    case "contacted": return ["completed", "canceled"];
    default: return [];
  }
}

export function DemoRequestsTab({ rows }: { rows: DemoRequestRow[] }) {
  const [requests, setRequests] = useState(rows);
  const [filter, setFilter] = useState<DemoRequestStatus | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStatusChange(id: string, status: DemoRequestStatus) {
    setPendingId(id);
    startTransition(async () => {
      const res = await updateDemoRequestStatus(id, status);
      if (res.ok) setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      setPendingId(null);
    });
  }

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f === "all" ? requests.length : requests.filter((r) => r.status === f).length;
    return acc;
  }, {} as Record<DemoRequestStatus | "all", number>);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <CalendarClock className="h-4.5 w-4.5 text-[#18A7B8]" /> Demo requests
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Every demo booked from the landing page&apos;s &quot;Book a demo&quot; popup.
          </p>
        </div>

        <div className="p-4 flex flex-wrap items-center gap-1.5 border-b border-slate-100 dark:border-slate-800">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f
                  ? "bg-[#18A7B8] text-white"
                  : "text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"
              }`}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]} <span className="opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-slate-400 text-center">No demo requests here.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filtered.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4 flex-wrap hover:bg-slate-50/60 dark:hover:bg-[var(--muted)] transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">{r.full_name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <Mail className="h-3 w-3" /> {r.business_email}
                    <span className="mx-1 text-slate-300 dark:text-slate-700">·</span>
                    <Phone className="h-3 w-3" /> {r.phone}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    {r.industry} · {r.employee_count} employees · {r.monthly_revenue}/mo
                    {r.referral_source && <> · via {r.referral_source}</>}
                  </p>
                  {r.purpose && <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{r.purpose}&rdquo;</p>}
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-600 mt-1.5 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    {new Date(r.meeting_start_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {r.join_url && (
                      <a href={r.join_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline ml-1">
                        <Video className="h-3.5 w-3.5" /> Join link <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {nextActions(r.status).map((next) => (
                    <button
                      key={next}
                      onClick={() => handleStatusChange(r.id, next)}
                      disabled={pending && pendingId === r.id}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        next === "canceled"
                          ? "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                          : "border-[#18A7B8]/40 text-[#18A7B8] hover:bg-[#18A7B8] hover:text-white"
                      }`}
                    >
                      Mark {STATUS_LABEL[next]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
