"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

const CHANNEL_LABEL: Record<string, string> = {
  email: "Mailbox",
  linkedin: "LinkedIn",
  zoom: "Zoom",
  calendar: "Calendar",
};

/**
 * Shown instead of the full wizard when this tab is the OAuth popup landing
 * back on /onboarding after a connect flow finishes — this used to just
 * re-render the entire (reset-to-step-1) wizard here, which is what made
 * users think they had to redo onboarding from scratch if they touched this
 * tab instead of their original one. Auto-closes so they naturally end up
 * back on the original tab, which independently re-checks status on focus.
 */
export function OnboardingConnectResult({ connected, error }: { connected?: string; error?: string }) {
  const [canAutoClose, setCanAutoClose] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      window.close();
      // If window.close() is a no-op (tab wasn't opened by a script), let the
      // user know they need to close it themselves rather than sitting on a
      // "closing…" message forever.
      setCanAutoClose(false);
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const label = (connected && CHANNEL_LABEL[connected]) || "Integration";

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      {error ? (
        <>
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h1 className="text-lg font-bold text-slate-900 mb-1">Connection failed</h1>
          <p className="text-sm text-slate-500 max-w-sm">{error}</p>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
          <h1 className="text-lg font-bold text-slate-900 mb-1">{label} connected</h1>
          <p className="text-sm text-slate-500 max-w-sm">
            {canAutoClose ? "This tab will close automatically — head back to your onboarding tab." : "You can close this tab now and go back to your onboarding tab."}
          </p>
        </>
      )}
    </div>
  );
}
