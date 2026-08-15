"use client";
import { useState, useTransition } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { setActiveLeadProvider, type LeadProviderStatus } from "@/lib/queries/lead-provider-settings";
import type { LeadProviderName } from "@/lib/leads/provider";

const PROVIDER_INFO: Record<LeadProviderName, { label: string; envHint: string; description: string }> = {
  anysite: {
    label: "Anysite",
    envHint: "ANYSITE_API_KEY",
    description: "Searches Anysite's own cached LinkedIn database and finds emails via Anysite — both steps spend Anysite credits.",
  },
  bright_data: {
    label: "Bright Data",
    envHint: "BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE",
    description: "Searches LinkedIn via Google SERP scraping (Bright Data), with Anysite/guess-and-verify used only as an email enrichment fallback.",
  },
};

export function LeadProviderTab({ status }: { status: LeadProviderStatus }) {
  const [active, setActive] = useState(status.activeProvider);
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState<LeadProviderName | null>(null);

  function switchTo(provider: LeadProviderName) {
    if (provider === active || pending) return;
    setSwitching(provider);
    startTransition(async () => {
      const res = await setActiveLeadProvider(provider);
      if (res.ok) setActive(provider);
      setSwitching(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
            <Users className="h-5 w-5 text-blue-500" /> Lead Provider
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Picks which data source Buy Leads / Company-wise Leads uses to find real people. Both providers stay fully configured — this only decides which one runs, and takes effect immediately, no redeploy.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["anysite", "bright_data"] as const).map((p) => {
            const info = PROVIDER_INFO[p];
            const cfg = status.providers.find((x) => x.provider === p);
            const isActive = active === p;
            return (
              <button
                key={p}
                onClick={() => switchTo(p)}
                disabled={pending}
                className={`text-left rounded-2xl p-5 transition-all ${
                  isActive
                    ? "border-2 border-[#18A7B8] bg-[#18A7B8]/5 dark:bg-[#18A7B8]/10 shadow-sm relative"
                    : "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-base">{info.label}</span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#18A7B8] px-3 py-1 rounded-full shadow-sm">
                      <Check className="h-3.5 w-3.5 stroke-[3]" /> Active
                    </span>
                  ) : switching === p ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white">Switch</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-3 leading-relaxed">{info.description}</p>
                <p className="text-xs text-slate-400 dark:text-slate-600 font-mono mt-2">{info.envHint}</p>
                <p className={`text-xs mt-1 font-semibold ${cfg?.configured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {cfg?.configured ? "✓ API key configured" : "⚠ No API key set — add it to env vars"}
                </p>
              </button>
            );
          })}
        </div>
        {status.updatedAt && (
          <div className="px-5 pb-5 text-xs text-slate-400 dark:text-slate-500 font-medium">
            Last changed {new Date(status.updatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
