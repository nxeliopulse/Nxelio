export function EmptyState({ message = "No data yet." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-slate-400 dark:text-slate-500 text-center px-4">
      {message}
    </div>
  );
}

export function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-rose-500 text-center px-4">
      {message}
    </div>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="p-5 animate-pulse space-y-3">
      <div className="h-4 w-1/3 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-28 w-full bg-slate-100 dark:bg-slate-800 rounded" />
    </div>
  );
}
