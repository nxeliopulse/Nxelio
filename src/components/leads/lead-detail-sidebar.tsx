"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LeadDetailView, type Activity } from "@/components/leads/lead-detail-view";
import type { LeadRow } from "@/lib/queries/leads";

/**
 * Docked detail panel — a real sibling column next to the leads table (not a
 * modal overlay), matching the Clay-style "click a row, panel opens alongside
 * the table" pattern. The table stays fully visible and interactive on the left.
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
    <div
      className={`sticky top-4 h-[calc(100vh-2rem)] w-[520px] flex-shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg transition-transform duration-200 ease-out ${mounted ? "translate-x-0" : "translate-x-8 opacity-0"}`}
    >
      <div className="p-5">
        {loading || !data?.lead ? (
          <div className="flex h-[60vh] items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <LeadDetailView lead={data.lead} activities={data.activities} onClose={onClose} embedded />
        )}
      </div>
    </div>
  );
}
