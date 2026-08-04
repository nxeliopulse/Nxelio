import { cn } from "@/lib/utils";

export function InfoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3", className)}>{children}</div>;
}

// Label/value row for InfoGrid. Renders nothing when `value` is empty —
// callers never need a per-field "should I show this?" check, and no card
// ever shows a fake placeholder for data that doesn't exist.
export function FieldRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={cn("min-w-0", className)}>
      <span className="block text-xs text-slate-500 font-medium mb-0.5 dark:text-slate-500">{label}</span>
      <span className="block text-sm font-semibold text-slate-900 truncate dark:text-white">{value}</span>
    </div>
  );
}
