import { cn } from "@/lib/utils";

export function SidebarCard({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs dark:bg-slate-900 dark:border-slate-800", className)}>
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center gap-2 dark:bg-slate-950/40 dark:border-slate-800">
        {icon}
        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
