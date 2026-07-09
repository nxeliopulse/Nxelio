import { Card } from "@/components/ui/card";

/**
 * Generic page skeleton shown instantly during route navigation (via each
 * route's loading.tsx) so screen-to-screen transitions feel immediate while
 * the server renders / Turbopack compiles. Variants tweak the body layout.
 */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "cards" | "board" }) {
  return (
    <div className="max-w-[1600px] mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-72 bg-slate-100 rounded" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-lg" />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-4 w-24 bg-slate-100 rounded mb-3" />
            <div className="h-7 w-20 bg-slate-200 rounded" />
          </Card>
        ))}
      </div>

      {variant === "board" ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className="w-72 flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
              <div className="h-6 w-32 bg-slate-200 rounded mb-3 mx-2 mt-1" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 mb-2 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-100 rounded" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : variant === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <div className="h-5 w-2/3 bg-slate-200 rounded" />
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-5/6 bg-slate-100 rounded" />
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="h-11 bg-slate-50 border-b border-slate-100" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50">
              <div className="h-8 w-8 rounded-full bg-slate-200 flex-shrink-0" />
              <div className="h-4 flex-1 bg-slate-100 rounded" />
              <div className="h-4 w-24 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
