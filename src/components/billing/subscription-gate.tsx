"use client";
import { useState } from "react";
import {
  Check, Zap, Star, Shield,
  Mail, BarChart2, Users, Calendar, Link,
  Loader2,
} from "lucide-react";
import { PlanTermsModal } from "@/components/billing/plan-terms-modal";

type PlanId = "basic" | "starter" | "pro";
type Interval = "monthly" | "annual";

const PLANS: {
  id: PlanId;
  name: string;
  badge?: string;
  monthly: number;
  annual: number;
  credits: number;
  leads: number;
  trial?: string;
  color: string;
  icon: React.ReactNode;
  features: string[];
}[] = [
  {
    id: "basic",
    name: "Basic",
    monthly: 14.99,
    annual: 11.99,
    credits: 200,
    leads: 0,
    trial: "7-day free trial",
    color: "#06B6D4",
    icon: <Zap size={16} />,
    features: [
      "Bring your own leads (CSV import)",
      "AI enrichment & scoring",
      "Email + LinkedIn outreach",
      "Reply tracking",
      "Meetings & calendar sync",
      "Standard support",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    badge: "Most Popular",
    monthly: 149.99,
    annual: 119.99,
    credits: 700,
    leads: 1000,
    color: "#8B5CF6",
    icon: <Star size={16} />,
    features: [
      "Everything in Basic",
      "Automated lead discovery",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 299.99,
    annual: 239.99,
    credits: 1500,
    leads: 2000,
    color: "#10B981",
    icon: <Shield size={16} />,
    features: [
      "Everything in Starter",
      "Priority support",
    ],
  },
];

export function SubscriptionGate() {
  const [selected, setSelected]   = useState<PlanId>("starter");
  const [interval, setInterval]   = useState<Interval>("monthly");
  const [pending, setPending]      = useState(false);
  const [error, setError]          = useState<string | null>(null);
  const [promoCode, setPromoCode]     = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoResult, setPromoResult]     = useState<{ ok: boolean; error?: string; description?: string | null } | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoChecking(true);
    setPromoResult(null);
    try {
      const res = await fetch("/api/billing/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode, planId: selected }),
      });
      setPromoResult(await res.json());
    } catch {
      setPromoResult({ ok: false, error: "Couldn't check that code — try again." });
    } finally {
      setPromoChecking(false);
    }
  }

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selected,
          billingInterval: interval,
          promoCode: promoResult?.ok ? promoCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed — please try again.");
      setPending(false);
    }
  }

  const selectedPlan = PLANS.find(p => p.id === selected)!;

  function chooseAndProceed(planId: PlanId) {
    setSelected(planId);
    setTermsOpen(true);
  }

  return (
    <div className="relative h-screen overflow-y-auto flex flex-col items-center justify-center px-4 py-4"
      style={{ background: "linear-gradient(180deg, #0a3fd1 0%, #0e5fdb 35%, #139be8 70%, #17c8f5 100%)" }}>

      {/* Decorative giant background wordmark, like a faint watermark behind the heading */}
      <div className="pointer-events-none fixed inset-x-0 top-2 flex justify-center overflow-hidden select-none" aria-hidden>
        <span
          className="font-black tracking-tight whitespace-nowrap"
          style={{
            fontSize: "clamp(70px, 16vw, 200px)",
            lineHeight: 1,
            background: "linear-gradient(135deg,#06B6D4,#8B5CF6)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            opacity: 0.16,
            filter: "blur(1px)",
          }}
        >
          PRICING
        </span>
      </div>

      {/* Logo */}
      <div className="relative z-10 mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg,#06B6D4,#8B5CF6)" }}>
          <BarChart2 size={16} className="text-white" />
        </div>
        <span className="text-lg font-black text-white tracking-tight">Nxelio Nurture</span>
      </div>

      {/* Heading */}
      <div className="relative z-10 mb-1 text-center">
        <h1 className="text-2xl font-black text-white mb-1.5">Choose your plan</h1>
        <p className="text-xs max-w-sm mx-auto" style={{ color: "rgba(255,255,255,.75)" }}>
          Add a payment method to activate your workspace. No charge during your trial.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="relative z-10 mt-3 mb-5 flex items-center gap-3">
        <span className={`text-sm font-medium transition-colors ${interval === "monthly" ? "text-white" : "text-white/60"}`}>Monthly</span>
        <button
          onClick={() => setInterval(i => i === "monthly" ? "annual" : "monthly")}
          className="relative h-6 w-12 flex-shrink-0 rounded-full transition-colors"
          style={{ background: interval === "annual" ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.12)" }}>
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform"
            style={{ background: interval === "annual" ? "#05070d" : "#ffffff", transform: interval === "annual" ? "translateX(1.5rem)" : "translateX(0)" }} />
        </button>
        <span className={`text-sm font-medium transition-colors ${interval === "annual" ? "text-white" : "text-white/60"}`}>Annual</span>
        {interval === "annual" && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ background: "rgba(6,182,212,.2)", border: "1px solid rgba(6,182,212,.4)" }}>
            Save 20%
          </span>
        )}
      </div>

      {/* Plan cards */}
      <div className="relative z-10 grid grid-cols-1 gap-5 sm:grid-cols-3 w-full max-w-5xl mb-4">
        {PLANS.map(plan => {
          const featured = Boolean(plan.badge);
          const displayPrice = interval === "annual" ? plan.annual : plan.monthly;
          return (
            <div
              key={plan.id}
              className="relative rounded-3xl p-5 flex flex-col backdrop-blur-md"
              style={{
                border: featured ? `1.5px solid ${plan.color}88` : "1.5px solid rgba(255,255,255,.18)",
                background: featured
                  ? `linear-gradient(160deg, ${plan.color}40 0%, rgba(3,8,22,.72) 60%)`
                  : "rgba(3,8,22,.6)",
                boxShadow: featured ? `0 8px 32px ${plan.color}3d, 0 0 0 1px rgba(0,0,0,.2)` : "0 8px 24px rgba(0,0,0,.25)",
              }}>

              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold text-white whitespace-nowrap"
                  style={{ background: `linear-gradient(135deg,${plan.color},${plan.color}99)` }}>
                  {plan.badge}
                </div>
              )}

              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: `${plan.color}22`, color: plan.color }}>
                {plan.icon}
              </div>

              <p className="font-bold text-white mb-0.5 text-base">{plan.name}</p>
              {plan.trial && interval === "monthly" ? (
                <p className="text-[11px] mb-2" style={{ color: plan.color }}>{plan.trial}</p>
              ) : (
                <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,.6)" }}>&nbsp;</p>
              )}

              <div className="mb-1">
                <span className="text-2xl font-black text-white">${displayPrice.toFixed(displayPrice % 1 === 0 ? 0 : 2)}</span>
                <span className="text-xs ml-1" style={{ color: "rgba(255,255,255,.55)" }}>/mo</span>
              </div>
              <div className="mb-3 flex flex-col gap-0.5">
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,.65)" }}>{plan.credits.toLocaleString()} AI credits / mo</span>
                {plan.leads > 0 && (
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,.65)" }}>{plan.leads.toLocaleString()} AI-discovered leads / mo</span>
                )}
              </div>

              <ul className="space-y-1.5 mb-5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,.85)" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.15)" }}>
                      <Check size={10} style={{ color: plan.color }} strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => chooseAndProceed(plan.id)}
                disabled={pending}
                className="mt-auto w-full py-2.5 rounded-full text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#ffffff", color: "#05070d" }}>
                {plan.trial && interval === "monthly" ? "Start free trial" : "Choose Plan"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Promo code */}
      <div className="relative z-10 w-full max-w-sm mb-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={e => { setPromoCode(e.target.value); setPromoResult(null); }}
            onKeyDown={e => e.key === "Enter" && applyPromo()}
            placeholder="Promo code (optional)"
            className="flex-1 px-3.5 py-2 rounded-xl text-sm text-white placeholder-white/50 outline-none transition-all"
            style={{ background: "rgba(3,8,22,.55)", border: "1.5px solid rgba(255,255,255,.22)" }}
          />
          <button
            onClick={applyPromo}
            disabled={promoChecking || !promoCode.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ background: "rgba(3,8,22,.55)", border: "1.5px solid rgba(255,255,255,.25)" }}>
            {promoChecking ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
          </button>
        </div>
        {promoResult && (
          <p className="mt-1.5 text-xs px-3.5" style={{ color: promoResult.ok ? "#34D399" : "#f87171" }}>
            {promoResult.ok ? (promoResult.description || "Code applied!") : promoResult.error}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-center text-xs rounded-xl px-4 py-2"
            style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.3)", color: "#f87171" }}>
            {error}
          </p>
        )}
        <p className="mt-2 text-center text-[11px]" style={{ color: "rgba(255,255,255,.6)" }}>
          Secured by Stripe · Cancel anytime{selectedPlan.trial && interval === "monthly" ? " · No charge during trial" : ""}
        </p>
      </div>

      {/* Trust badges */}
      <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-5">
        {[
          { icon: <Shield size={13} />, label: "SOC 2-ready" },
          { icon: <Users size={13} />, label: "GDPR compliant" },
          { icon: <Mail size={13} />, label: "Workspace-isolated data" },
          { icon: <Link size={13} />, label: "LinkedIn + email" },
          { icon: <Calendar size={13} />, label: "Cancel anytime" },
        ].map((b, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,.55)" }}>
            <span style={{ color: "rgba(255,255,255,.65)" }}>{b.icon}</span>
            {b.label}
          </span>
        ))}
      </div>

      <PlanTermsModal
        open={termsOpen}
        planName={selectedPlan.name}
        onClose={() => setTermsOpen(false)}
        onConfirm={() => { setTermsOpen(false); startCheckout(); }}
        confirming={pending}
      />
    </div>
  );
}
