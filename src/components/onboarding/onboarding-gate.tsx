import Link from "next/link";
import { BarChart2, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import type { OnboardingStatus } from "@/lib/queries/onboarding";

/**
 * Hard-lock popup shown in place of the whole app when onboarding isn't
 * complete — the defense-in-depth safety net for anyone who lands on an app
 * URL directly (the proactive path is the redirect at login/callback time
 * into /onboarding; most users never see this). Visually a sibling of
 * SubscriptionGate (same background/logo treatment) since a user may see
 * both gates back-to-back in the same flow.
 */
export function OnboardingGate({ status }: { status: OnboardingStatus }) {
  const items = [
    { label: "Your profile", done: status.profileComplete },
    { label: "Company & business info", done: status.businessComplete },
    { label: "Connect your inbox", done: status.mailboxComplete },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1224 50%, #0a0f1e 100%)" }}>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #06B6D4, transparent)" }} />
        <div className="absolute bottom-0 right-1/4 h-60 w-60 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #8B5CF6, transparent)" }} />
      </div>

      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg,#06B6D4,#8B5CF6)" }}>
          <BarChart2 size={24} className="text-white" />
        </div>
        <span className="text-2xl font-black text-white tracking-tight">Nxelio Nurture</span>
      </div>

      <div className="w-full max-w-xl rounded-3xl p-10 text-center" style={{ border: "1.5px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" }}>
        <h1 className="text-4xl font-black text-white mb-4">Complete Your Onboarding</h1>
        <p className="text-base mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,.5)" }}>
          Finish setting up your profile, company information, required integrations, and subscription to unlock all features.
        </p>

        <div className="space-y-3 mb-8 text-left max-w-sm mx-auto">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3 text-base">
              {item.done
                ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
                : <Circle className="h-5 w-5 flex-shrink-0" style={{ color: "rgba(255,255,255,.25)" }} />}
              <span style={{ color: item.done ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.85)" }}>{item.label}</span>
            </div>
          ))}
        </div>

        <Link
          href="/onboarding"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#06B6D4,#8B5CF6)" }}
        >
          Complete Onboarding <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
