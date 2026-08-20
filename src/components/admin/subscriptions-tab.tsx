"use client";
import { useState } from "react";
import type { SubscriptionRow } from "@/lib/queries/platform-overview";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const STATUS_STYLE: Record<string, string> = {
  active:        "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold",
  trialing:      "bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold",
  trial_ended:   "bg-orange-50 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 font-semibold",
  past_due:      "bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold",
  canceled:      "bg-slate-100 dark:bg-[var(--muted)] text-slate-600 dark:text-slate-500 border border-slate-200 dark:border-slate-700 font-semibold",
};

const STATUS_LABEL: Record<string, string> = {
  active:      "Active",
  trialing:    "Trialing",
  trial_ended: "Trial Ended",
  past_due:    "Past Due",
  canceled:    "Canceled",
};

function effectiveStatus(r: SubscriptionRow): string {
  if (r.status === "trialing" && r.trial_ends_at && new Date(r.trial_ends_at) < new Date()) {
    return "trial_ended";
  }
  return r.status;
}

const PAGE_SIZE = 15;

export function SubscriptionsTab({ rows }: { rows: SubscriptionRow[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
        <h3 className="font-bold text-slate-900 dark:text-white text-base">Customer Subscriptions</h3>
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">View-only &mdash; billed and managed via Stripe.</p>
      </div>
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
        <DataTable className="min-w-[800px]">
          <DataTableHead className="sticky top-0 z-10">
            <tr className="text-left">
              <DataTableTh>Workspace</DataTableTh>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh>Billing</DataTableTh>
              <DataTableTh>Status</DataTableTh>
              <DataTableTh>Credits</DataTableTh>
              <DataTableTh>Renews</DataTableTh>
              <DataTableTh>Stripe ID</DataTableTh>
            </tr>
          </DataTableHead>
          <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {paged.length === 0 && (
              <DataTableEmpty colSpan={7}>No subscriptions yet.</DataTableEmpty>
            )}
            {paged.map((r) => {
              const status = effectiveStatus(r);
              return (
              <DataTableRow key={r.workspace_id}>
                <DataTableTd className="font-semibold text-slate-900 dark:text-white">{r.workspace_name}</DataTableTd>
                <DataTableTd className="text-slate-600 dark:text-slate-500 font-medium">{r.plan_name}</DataTableTd>
                <DataTableTd className="text-slate-500 dark:text-slate-500 capitalize">{r.billing_interval}</DataTableTd>
                <DataTableTd>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[status] || "bg-slate-100 dark:bg-[var(--muted)] text-slate-600 dark:text-slate-500"}`}>
                    {STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
                  </span>
                </DataTableTd>
                <DataTableTd className="text-slate-900 dark:text-slate-700 font-semibold tabular-nums">{r.credits_remaining} / {r.credits_total}</DataTableTd>
                <DataTableTd className="text-slate-600 dark:text-slate-500 whitespace-nowrap">
                  {status === "trial_ended" && r.trial_ends_at
                    ? <span className="text-orange-600 dark:text-orange-400">Ended {formatDate(r.trial_ends_at)}</span>
                    : status === "trialing" && r.trial_ends_at
                    ? <span className="text-amber-600 dark:text-amber-400">Expires {formatDate(r.trial_ends_at)}</span>
                    : formatDate(r.current_period_end)}
                </DataTableTd>
                <DataTableTd className="text-slate-400 dark:text-slate-500 font-mono text-xs">{r.stripe_customer_id || "—"}</DataTableTd>
              </DataTableRow>
            );})}
          </DataTableBody>
        </DataTable>
      </div>
      <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={rows.length} onPageChange={(p) => setPage(p - 1)} />
    </Card>
  );
}

