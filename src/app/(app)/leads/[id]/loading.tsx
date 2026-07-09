import { Card } from "@/components/ui/card";

// Shown instantly on navigation while getLeadDetail() resolves on the server,
// so clicking a lead gives immediate feedback instead of a frozen screen.
export default function LeadDetailLoading() {
  return (
    <div className="max-w-[1600px] mx-auto animate-pulse">
      <div className="h-4 w-24 bg-slate-200 rounded mb-4" />

      {/* Hero card skeleton */}
      <Card className="p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="h-16 w-16 rounded-2xl bg-slate-200 flex-shrink-0" />
          <div className="flex-1 min-w-[280px] space-y-3">
            <div className="h-7 w-56 bg-slate-200 rounded" />
            <div className="h-4 w-40 bg-slate-100 rounded" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-32 bg-slate-100 rounded" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-slate-200" />
            <div className="flex flex-col gap-2">
              <div className="h-10 w-40 bg-slate-200 rounded-lg" />
              <div className="h-10 w-40 bg-slate-100 rounded-lg" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          {/* Tab bar skeleton */}
          <div className="flex gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-28 bg-slate-100 rounded" />
            ))}
          </div>
          {/* Body skeleton */}
          <Card className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-100 rounded" style={{ width: `${90 - i * 10}%` }} />
            ))}
          </Card>
        </div>

        {/* Sidebar skeleton */}
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <div className="h-4 w-32 bg-slate-200 rounded" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-slate-200" />
                <div className="h-3 flex-1 bg-slate-100 rounded" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
