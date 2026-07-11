"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LeadDetailView, type Activity } from "@/components/leads/lead-detail-view";
import type { LeadRow } from "@/lib/queries/leads";

/**
 * Slide-over panel showing a lead's full detail (same content as the standalone
 * /leads/[id] page) without navigating away from the leads table. Opens over a
 * dimmed backdrop; Escape or backdrop click closes it.
 */
export function LeadDetailSidebar({
  data,
  loading,
  onClose,
}: {
  data: { lead: LeadRow; activities: Activity[] } | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Animate in on the next frame instead of at initial (unmounted) state.
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative h-full w-full max-w-[1100px] overflow-y-auto bg-slate-50 shadow-2xl transition-transform duration-200 ease-out ${mounted ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-6">
          {loading || !data?.lead ? (
            <div className="flex h-[60vh] items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <LeadDetailView lead={data.lead} activities={data.activities} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
