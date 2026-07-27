"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, X } from "lucide-react";

/** Shown across the app when the workspace hasn't finished onboarding. */
export function OnboardingBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-3 sm:mx-4 lg:mx-6 mt-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
      <span className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-blue-900">Finish setting up Nxelio Nurture</p>
        <p className="text-xs text-blue-700/80">Tell us about your business so we can tailor leads, scoring, and outreach to you.</p>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Complete setup <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
