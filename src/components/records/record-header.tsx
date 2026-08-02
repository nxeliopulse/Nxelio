"use client";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic record-detail header: breadcrumb, icon + eyebrow + title, a row of
// status/stage badges, an optional headline value (deal size, total, etc.),
// and prev/next record navigation. Every entity's detail view (Lead, Account,
// Contact, Opportunity, ...) supplies its own icon/labels/data — this
// component has no entity-specific knowledge.
export function RecordHeader({
  breadcrumbHref,
  breadcrumbLabel,
  icon,
  iconClassName,
  eyebrow,
  title,
  badges,
  headline,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  onEdit,
  moreMenu,
}: {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  icon: React.ReactNode;
  iconClassName?: string;
  eyebrow: string;
  title: string;
  badges?: React.ReactNode;
  headline?: React.ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onEdit?: () => void;
  moreMenu?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3 px-1">
        <Link href={breadcrumbHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> {breadcrumbLabel}
        </Link>
        {(onPrev || onNext) && (
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={!onPrev || prevDisabled}
              aria-label="Previous record"
              className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!onNext || nextDisabled}
              aria-label="Next record"
              className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("h-11 w-11 rounded-lg text-white flex items-center justify-center flex-shrink-0 shadow-xs", iconClassName || "bg-slate-600")}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">{eyebrow}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight dark:text-white">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {badges}
            {headline}
            {onEdit && (
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {moreMenu}
          </div>
        </div>
      </div>
    </div>
  );
}
