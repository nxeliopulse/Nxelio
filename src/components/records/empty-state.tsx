import { cn } from "@/lib/utils";

// Generic empty-state block: icon + title + description + an optional
// primary action (which may be disabled — an honestly-disabled button beats
// blank space or a fabricated placeholder).
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <div className="h-11 w-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3 dark:bg-[var(--muted)] dark:text-slate-500">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-700">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs dark:text-slate-500">{description}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          disabled={actionDisabled || !onAction}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-800 dark:text-slate-700 dark:hover:bg-[var(--muted)]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
