"use client";
import { useState } from "react";
import {
  CreditCard, Check, Zap, Star, Shield,
  Mail, BarChart2, Users, Calendar, Link,
  ChevronRight, Loader2,
} from "lucide-react";

type PlanId = "basic" | "starter" | "pro";
type Interval = "monthly" | "annual";

const PLANS: {
  id: PlanId;
  name: string;
  badge?: string;
  monthly: number;
  annual: number;
  credits: number;
  trial?: string;
  color: string;
  icon: React.ReactNode;
  features: string[];
}[] = [
  {
    id: "basic",
    name: "Basic",
    monthly: 9.99,
    annual: 7.99,
    credits: 200,
    trial: "7-day free trial",
    color: "#06B6D4",
    icon: <Zap size={16} />,
    features: [
      "200 AI credits / month",
      "CSV import",
      "Core workflows",
      "Email campaigns",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    badge: "Most Popular",
    monthly: 69,
    annual: 55.20,
    credits: 1200,
    color: "#8B5CF6",
    icon: <Star size={16} />,
    features: [
      "1,200 AI credits / month",
      "Lead discovery & enrichment",
      "AI lead scoring",
      "LinkedIn outreach",
      "CRM export",
      "Opportunities pipeline",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 149,
    annual: 119.20,
    credits: 3000,
    color: "#10B981",
    icon: <Shield size={16} />,
    features: [
      "3,000 AI credits / month",
      "Everything in Starter",
      "Reply tracking",
      "Meetings & calendar",
      "Priority support",
    ],
  },
];

export function SubscriptionGate() {
  const [selected, setSelected]   = useState<PlanId>("starter");
  const [interval, setInterval]   = useState<Interval>("monthly");
  const [pending, setPending]      = useState(false);
  const [error, setError]          = useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selected, billingInterval: interval }),
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
  const price = interval === "annual" ? selectedPlan.annual : selectedPlan.monthly;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1224 50%, #0a0f1e 100%)" }}>

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #06B6D4, transparent)" }} />
        <div className="absolute bottom-0 right-1/4 h-60 w-60 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #8B5CF6, transparent)" }} />
      </div>

      {/* Logo */}
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg,#06B6D4,#8B5CF6)" }}>
          <BarChart2 size={18} className="text-white" />
        </div>
        <span className="text-xl font-black text-white tracking-tight">Nxelio</span>
      </div>

      {/* Heading */}
      <div className="mb-2 text-center">
        <h1 className="text-3xl font-black text-white mb-3">Choose your plan</h1>
        <p className="text-sm max-w-sm mx-auto" style={{ color: "rgba(255,255,255,.45)" }}>
          Add a payment method to activate your workspace. No charge during your trial.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="mt-6 mb-8 flex items-center gap-3">
        <span className={`text-sm font-medium transition-colors ${interval === "monthly" ? "text-white" : "text-white/40"}`}>Monthly</span>
        <button
          onClick={() => setInterval(i => i === "monthly" ? "annual" : "monthly")}
          className="relative h-6 w-12 rounded-full transition-colors"
          style={{ background: interval === "annual" ? "linear-gradient(135deg,#06B6D4,#8B5CF6)" : "rgba(255,255,255,.12)" }}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${interval === "annual" ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
        <span className={`text-sm font-medium transition-colors ${interval === "annual" ? "text-white" : "text-white/40"}`}>Annual</span>
        {interval === "annual" && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ background: "rgba(6,182,212,.2)", border: "1px solid rgba(6,182,212,.4)" }}>
            Save 20%
          </span>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 w-full max-w-3xl mb-8">
        {PLANS.map(plan => {
          const isSelected = selected === plan.id;
          const displayPrice = interval === "annual" ? plan.annual : plan.monthly;
          return (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className="relative rounded-2xl p-5 text-left transition-all"
              style={{
                border: isSelected ? `1.5px solid ${plan.color}66` : "1.5px solid rgba(255,255,255,.08)",
                background: isSelected ? `${plan.color}0e` : "rgba(255,255,255,.03)",
                boxShadow: isSelected ? `0 0 24px ${plan.color}22` : "none",
              }}>

              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold text-white whitespace-nowrap"
                  style={{ background: `linear-gradient(135deg,${plan.color},${plan.color}99)` }}>
                  {plan.badge}
                </div>
              )}

              {/* Selection ring */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: `${plan.color}22`, color: plan.color }}>
                  {plan.icon}
                </div>
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all`}
                  style={{
                    borderColor: isSelected ? plan.color : "rgba(255,255,255,.2)",
                    background: isSelected ? plan.color : "transparent",
                  }}>
                  {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
              </div>

              <p className="font-bold text-white mb-0.5">{plan.name}</p>
              {plan.trial && interval === "monthly" && (
                <p className="text-[11px] mb-2" style={{ color: plan.color }}>{plan.trial}</p>
              )}

              <div className="mb-4">
                <span className="text-2xl font-black text-white">${displayPrice.toFixed(displayPrice % 1 === 0 ? 0 : 2)}</span>
                <span className="text-xs ml-1" style={{ color: "rgba(255,255,255,.35)" }}>/mo</span>
              </div>

              <ul className="space-y-1.5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: "rgba(255,255,255,.6)" }}>
                    <Check size={11} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={startCheckout}
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: `linear-gradient(135deg,${selectedPlan.color},${selectedPlan.color}99)`, boxShadow: `0 4px 20px ${selectedPlan.color}44` }}>
          {pending
            ? <><Loader2 size={16} className="animate-spin" /> Redirecting to checkout…</>
            : <><CreditCard size={16} /> {selectedPlan.trial && interval === "monthly" ? `Start ${selectedPlan.trial}` : `Subscribe to ${selectedPlan.name}`} <ChevronRight size={15} /></>
          }
        </button>

        {error && (
          <p className="text-center text-xs rounded-xl px-4 py-2.5"
            style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.3)", color: "#f87171" }}>
            {error}
          </p>
        )}

        <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,.25)" }}>
          Secured by Chargebee · Cancel anytime{selectedPlan.trial && interval === "monthly" ? " · No charge during trial" : ""}
        </p>
      </div>

      {/* Trust badges */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
        {[
          { icon: <Shield size={13} />, label: "SOC 2-ready" },
          { icon: <Users size={13} />, label: "GDPR compliant" },
          { icon: <Mail size={13} />, label: "Workspace-isolated data" },
          { icon: <Link size={13} />, label: "LinkedIn + email" },
          { icon: <Calendar size={13} />, label: "Cancel anytime" },
        ].map((b, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,.25)" }}>
            <span style={{ color: "rgba(255,255,255,.35)" }}>{b.icon}</span>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
