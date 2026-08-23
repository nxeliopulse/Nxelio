"use client";

import { useState, useTransition, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check, X, Sparkles, CreditCard, Users2, Send,
  Zap, Crown, Rocket, AlertTriangle, Clock,
  TrendingUp, ExternalLink, Loader2, PartyPopper,
  Target, Ticket, Gift, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import type {
  SubscriptionWithPlan, SubscriptionPlan, BillingInterval, PromoValidationResult,
} from "@/lib/queries/subscription-types";
import type { PromotionHistoryEntry } from "@/lib/queries/promotions";
import { PlanTermsModal } from "@/components/billing/plan-terms-modal";
import { BillingSupportWidget } from "@/components/billing/billing-support-widget";
import { CancellationFlowModal } from "@/components/billing/cancellation-flow-modal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
function annualMonthly(cents: number) {
  return `$${((cents / 100) / 12).toFixed(2)}`;
}
function trialDaysLeft(endsAt: string | null) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}
function credPct(remaining: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round(((total - remaining) / total) * 100));
}
function isLow(remaining: number, total: number) {
  return total > 0 && remaining / total <= 0.1;
}

/** Builds a customer-facing "here's what you get" message from the actual discount fields — never just the admin's internal note, which may be blank or say nothing about the offer itself. */
function promoSuccessMessage(result: { description?: string | null; discountType?: "percentage" | "fixed_amount" | null; discountValue?: number | null; bonusCredits?: number; bonusLeads?: number }): string {
  const parts: string[] = [];
  if (result.discountType && result.discountValue) {
    parts.push(result.discountType === "percentage" ? `${result.discountValue}% off` : `${fmtCents(result.discountValue * 100)} off`);
  }
  if (result.bonusCredits) parts.push(`+${result.bonusCredits.toLocaleString()} AI credits`);
  if (result.bonusLeads) parts.push(`+${result.bonusLeads.toLocaleString()} leads`);
  const offer = parts.length ? parts.join(", ") : null;
  if (offer) return `${offer} — will be applied at your next checkout.`;
  return result.description || "Code applied — it'll be used on your next checkout below.";
}

// ── Plan display config ───────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ElementType> = {
  basic: Zap, starter: Rocket, pro: Crown,
};
const PLAN_DESC: Record<string, string> = {
  basic:   "Bring your own leads",
  starter: "Email + LinkedIn, all-in-one",
  pro:     "Highest volume + full suite",
};

const PLAN_ROWS: Record<string, Array<{ label: string; included: boolean }>> = {
  basic: [
    { label: "400 AI credits / mo",      included: true  },
    { label: "Bring your own leads (CSV)", included: true  },
    { label: "AI enrichment + scoring",  included: true  },
    { label: "Email + LinkedIn outreach",included: true  },
    { label: "Reply tracking",           included: true  },
    { label: "Meetings & calendar sync", included: true  },
    { label: "Standard support",         included: true  },
    { label: "Automated lead discovery", included: false },
  ],
  starter: [
    { label: "Everything in Basic",      included: true  },
    { label: "1,400 AI credits / mo",    included: true  },
    { label: "Automated lead discovery", included: true  },
    { label: "1,000 AI-discovered leads / mo", included: true  },
    { label: "Priority support",         included: false },
  ],
  pro: [
    { label: "Everything in Starter",    included: true  },
    { label: "2,400 AI credits / mo",    included: true  },
    { label: "2,000 AI-discovered leads / mo", included: true  },
    { label: "Priority support",         included: true  },
  ],
};

// Annual prices — 2 months free (~17% off monthly), rounded to clean values
const ANNUAL_DISPLAY: Record<string, { monthly: number; yearly: number; savePct: number }> = {
  basic:   { monthly: 7.50,  yearly: 90.00,   savePct: 17 },
  starter: { monthly: 49.00, yearly: 588.00,  savePct: 17 },
  pro:     { monthly: 116.00, yearly: 1392.00, savePct: 17 },
};

const TOP_UP_PACKS = [
  { credits: 100,  price_cents: 500,  label: "100 credits",   per: "$0.05 / credit" },
  { credits: 500,  price_cents: 2000, label: "500 credits",   per: "$0.04 / credit" },
  { credits: 1500, price_cents: 5000, label: "1,500 credits", per: "$0.033 / credit" },
];

const STATUS_COLORS: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-700",
  active:   "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial", active: "Active",
  past_due: "Past due",   canceled: "Canceled",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  subscription: SubscriptionWithPlan | null;
  plans: SubscriptionPlan[];
  leadsCount: number;
  sentCount: number;
  promotionHistory: PromotionHistoryEntry[];
}

// ── Component ─────────────────────────────────────────────────────────────────

// Tiny component that reads search params — isolated in Suspense so the rest
// of the page renders immediately without waiting for this hook.
function CheckoutSuccessWatcher({
  plans,
  onSuccess,
}: {
  plans: SubscriptionPlan[];
  onSuccess: (planName: string, credits: number) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;

    // Read the plan the user clicked before redirect (stored in goCheckout).
    // The actual subscription sync already happened server-side in
    // /checkout-return before this page ever loaded — this just picks the
    // right name/credits for the success modal.
    const pendingPlanId = sessionStorage.getItem("pending_plan") ?? "";
    sessionStorage.removeItem("pending_plan");

    const plan = plans.find((p) => p.id === pendingPlanId);
    const planName = plan?.name ?? (pendingPlanId ? pendingPlanId.charAt(0).toUpperCase() + pendingPlanId.slice(1) : "new");
    const credits = plan?.credits_per_cycle ?? 0;

    onSuccess(planName, credits);

    router.replace("/billing");
    router.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

export function BillingView({ subscription: sub, plans, leadsCount, sentCount, promotionHistory }: Props) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkoutPending, startCheckout] = useTransition();
  const [portalPending, startPortal] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [cancelModalError, setCancelModalError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successPlanName, setSuccessPlanName] = useState("");
  const [successCredits, setSuccessCredits] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoValidationResult | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [cancellationFlowOpen, setCancellationFlowOpen] = useState(false);

  const currentPlanId       = sub?.plan_id          ?? "basic";
  const currentInterval     = sub?.billing_interval ?? "monthly";
  const status              = sub?.status           ?? "trialing";
  const credRemaining = sub?.credits_remaining ?? 0;
  const credTotal     = sub?.credits_total     ?? 150;
  const credUsed      = credTotal - credRemaining;
  const pct           = credPct(credRemaining, credTotal);
  const low           = isLow(credRemaining, credTotal);
  const daysLeft      = trialDaysLeft(sub?.trial_ends_at ?? null);
  const hasPortal     = Boolean(sub?.stripe_customer_id);
  const cancelAtPeriodEnd = sub?.cancel_at_period_end ?? false;
  const periodEndDate = sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : null;
  const canCancel     = Boolean(sub?.stripe_subscription_id) && status !== "canceled";

  const leadsRemaining = sub?.leads_remaining ?? 0;
  const leadsTotal     = sub?.leads_total     ?? 0;
  const leadsPct       = credPct(leadsRemaining, leadsTotal);

  const planOrder: Record<string, number> = { basic: 0, starter: 1, pro: 2 };

  // ── Actions ────────────────────────────────────────────────

  function goCheckout(planId: string) {
    setCheckoutError(null);
    startCheckout(async () => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billingInterval: interval,
          promoCode: promoResult?.ok ? promoCode : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setCheckoutError(json.error ?? "Checkout failed"); setTermsOpen(false); return; }
      // Store the selected plan so the success popup shows the correct name
      sessionStorage.setItem("pending_plan", planId);
      window.location.href = json.url;
    });
  }

  /** Every checkout trigger goes through this first — opens the terms gate rather than checking out directly. */
  function requestCheckout(planId: string) {
    setPendingPlanId(planId);
    setTermsOpen(true);
  }

  function confirmTermsAndCheckout() {
    if (pendingPlanId) goCheckout(pendingPlanId);
  }

  function goPortal() {
    startPortal(async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) { setCheckoutError(json.error ?? "Portal failed"); return; }
      window.location.href = json.url;
    });
  }

  /** Calls Stripe directly (cancel_at_period_end) — doesn't depend on the
   *  hosted Customer Portal being configured, unlike goPortal() above.
   *  Error/loading state stays inside the cancel modal so a failure can't
   *  be missed the way a page-top banner can once the modal has closed. */
  function confirmCancel() {
    setCancelModalError(null);
    startCancel(async () => {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) { setCancelModalError(json.error ?? "Couldn't cancel — please try again."); return; }
      setCancelOpen(false);
      router.refresh();
    });
  }

  function resumeSubscription() {
    setCancelModalError(null);
    startCancel(async () => {
      const res = await fetch("/api/billing/resume", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) { setCancelModalError(json.error ?? "Couldn't resume — please try again."); return; }
      setCancelOpen(false);
      router.refresh();
    });
  }

  async function applyPromo(planId: string) {
    if (!promoCode.trim()) return;
    setPromoChecking(true);
    setPromoResult(null);
    try {
      const res = await fetch("/api/billing/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode, planId }),
      });
      setPromoResult(await res.json());
    } catch {
      setPromoResult({ ok: false, error: "Couldn't check that code — try again." });
    } finally {
      setPromoChecking(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto">
      <Suspense fallback={null}>
        <CheckoutSuccessWatcher
          plans={plans}
          onSuccess={(planName, credits) => {
            setSuccessPlanName(planName);
            setSuccessCredits(credits);
            setSuccessOpen(true);
          }}
        />
      </Suspense>
      <PageHeader
        title="Billing & subscription"
        description="Manage your plan, usage, and payment methods"
      />

      {/* ── Banners ──────────────────────────────────────────── */}
      {credRemaining === 0 && status !== "canceled" && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">You&apos;ve run out of credits</p>
            <p className="text-xs text-red-600 mt-0.5">All AI operations are paused. Upgrade your plan for more credits.</p>
          </div>
          <a href="#plans"><Button size="sm">Upgrade plan</Button></a>
        </div>
      )}
      {low && credRemaining > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{credRemaining} credits remaining — running low</p>
            <p className="text-xs text-amber-600 mt-0.5">Less than 10% of your monthly allowance.</p>
          </div>
          <a href="#plans"><Button size="sm" variant="outline">Upgrade plan</Button></a>
        </div>
      )}
      {status === "trialing" && daysLeft > 0 && daysLeft <= 3 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-5 py-4">
          <Clock className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">Trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
            <p className="text-xs text-blue-600 mt-0.5">Choose a plan to keep your workspace active.</p>
          </div>
          <Button size="sm" onClick={() => requestCheckout("starter")}>Choose a plan</Button>
        </div>
      )}
      {status === "past_due" && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Payment failed — please update your card</p>
            <p className="text-xs text-amber-600 mt-0.5">Your subscription is past due. Update your payment method to continue.</p>
          </div>
          {hasPortal && <Button size="sm" onClick={goPortal}>Update card</Button>}
        </div>
      )}
      {checkoutError && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-800">{checkoutError}</p>
          <button onClick={() => setCheckoutError(null)} className="ml-auto text-xs text-red-600 underline">Dismiss</button>
        </div>
      )}

      {/* ── Current plan hero ─────────────────────────────────── */}
      <Card className="overflow-hidden mb-6">
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 p-5 sm:p-8 text-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge className="bg-white/20 text-white ring-1 ring-white/30">Current plan</Badge>
                <Badge className="bg-white/20 text-white ring-1 ring-white/30 capitalize">{sub?.plan.name ?? "Basic"}</Badge>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
                {status === "trialing" && daysLeft > 0 && (
                  <span className="text-xs text-blue-100">{daysLeft} days left</span>
                )}
                {cancelAtPeriodEnd && (
                  <button
                    onClick={() => setCancelOpen(true)}
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-100 ring-1 ring-red-300/40 hover:bg-red-500/30"
                    title="Click to resume"
                  >
                    Cancels {periodEndDate ?? "soon"}
                  </button>
                )}
              </div>
              <h2 className="text-4xl font-bold">
                {sub ? fmtCents(sub.plan.monthly_price_cents) : "$14.99"}
                <span className="text-xl font-normal text-blue-100">/mo</span>
              </h2>
              <p className="text-blue-100 mt-2 max-w-md text-sm">
                {status === "trialing"
                  ? "You're in your 7-day free trial. No charge until your trial ends — cancel anytime before then."
                  : `${sub?.plan.name ?? "Basic"} plan · renews ${sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasPortal && (
                <Button
                  variant="custom"
                  className="bg-white/10 border border-white/30 text-white hover:bg-white/20"
                  onClick={goPortal}
                  disabled={portalPending}
                >
                  {portalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage billing
                </Button>
              )}
              {cancelAtPeriodEnd ? (
                <Button
                  variant="custom"
                  className="bg-white/10 border border-white/30 text-white hover:bg-white/20"
                  onClick={resumeSubscription}
                  disabled={cancelPending}
                >
                  {cancelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Resume subscription
                </Button>
              ) : (
                <Button
                  variant="custom"
                  className="bg-white/10 border border-white/30 text-white hover:bg-white/20"
                  onClick={() => setCancellationFlowOpen(true)}
                >
                  <X className="h-4 w-4" />
                  Cancel subscription
                </Button>
              )}
              <Button
                variant="custom"
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  const next = plans.find(p => planOrder[p.id] > planOrder[currentPlanId]);
                  if (next) requestCheckout(next.id);
                }}
                disabled={checkoutPending || currentPlanId === "pro"}
              >
                {checkoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                {currentPlanId === "pro" ? "Max plan" : "Upgrade plan"}
              </Button>
            </div>
          </div>
        </div>

        {/* Credit meter */}
        <div className="px-5 sm:px-8 py-5 border-t border-slate-100 bg-white">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">AI credits this cycle</span>
            </div>
            <span className="text-sm font-mono text-slate-700">
              {credRemaining.toLocaleString()} / {credTotal.toLocaleString()} remaining
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${credRemaining === 0 ? "bg-red-500" : low ? "bg-amber-400" : "bg-gradient-to-r from-blue-500 to-indigo-600"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-500">{pct}% used</span>
          </div>
        </div>

        {/* Leads meter (only for plans with an automated-discovery allowance) */}
        {leadsTotal > 0 && (
          <div className="px-5 sm:px-8 py-5 border-t border-slate-100 bg-white">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-800">AI-discovered leads this cycle</span>
              </div>
              <span className="text-sm font-mono text-slate-700">
                {leadsRemaining.toLocaleString()} / {leadsTotal.toLocaleString()} remaining
              </span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${leadsRemaining === 0 ? "bg-red-500" : isLow(leadsRemaining, leadsTotal) ? "bg-amber-400" : "bg-gradient-to-r from-emerald-500 to-teal-600"}`}
                style={{ width: `${leadsPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">{leadsPct}% used</span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Usage cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "AI credits used", Icon: Sparkles, used: credUsed,   total: credTotal,  color: "from-blue-500 to-indigo-600",  bar: "bg-blue-600",    hasBar: true },
          { label: "Total leads in CRM", Icon: Users2, used: leadsCount, total: 0,         color: "from-emerald-500 to-teal-600", bar: "bg-emerald-600", hasBar: false },
          { label: "Emails sent",     Icon: Send,     used: sentCount,   total: 0,         color: "from-purple-500 to-pink-600",  bar: "bg-purple-600",  hasBar: false },
        ].map(({ label, Icon, used, total, color, bar, hasBar }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${color} text-white flex items-center justify-center`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{label}</p>
                <p className="text-xs text-slate-500">{used.toLocaleString()}{hasBar ? ` / ${total.toLocaleString()}` : ""}</p>
              </div>
            </div>
            {hasBar && (
              <>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full`} style={{ width: `${credPct(total - used, total)}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-2">{credPct(total - used, total)}% used this cycle</p>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* ── Pricing grid ──────────────────────────────────────── */}
      <div className="mb-8" id="plans">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Pick a plan, grow your pipeline</h2>
          <p className="text-slate-500 mt-1">Start free. Upgrade when you&apos;re ready.</p>
          <div className="inline-flex items-center gap-1 mt-4 bg-slate-100 rounded-full p-1">
            {(["monthly", "annual"] as BillingInterval[]).map((iv) => (
              <button
                key={iv}
                onClick={() => setInterval(iv)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${interval === iv ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              >
                {iv === "monthly" ? "Monthly" : "Annual"}
                {iv === "annual" && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Save 17%</span>
                )}
              </button>
            ))}
          </div>

          {/* Promo code */}
          <div className="max-w-sm mx-auto mt-5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value); setPromoResult(null); }}
                  onKeyDown={(e) => e.key === "Enter" && applyPromo(plans.find(p => planOrder[p.id] > planOrder[currentPlanId])?.id ?? "starter")}
                  placeholder="Promo code"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => applyPromo(plans.find(p => planOrder[p.id] > planOrder[currentPlanId])?.id ?? "starter")}
                disabled={promoChecking || !promoCode.trim()}
              >
                {promoChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoResult && (
              <p className={`mt-2 text-xs font-semibold ${promoResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                {promoResult.ok ? promoSuccessMessage(promoResult) : promoResult.error}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const Icon                 = PLAN_ICONS[plan.id] ?? Zap;
            const isCurrent            = plan.id === currentPlanId && interval === currentInterval;
            const isSamePlanDiffInterval = plan.id === currentPlanId && interval !== currentInterval;
            const isPopular            = plan.id === "starter";
            const annualData           = ANNUAL_DISPLAY[plan.id];
            const price = interval === "monthly"
              ? fmtCents(plan.monthly_price_cents)
              : annualData ? `$${annualData.monthly.toFixed(2)}` : annualMonthly(plan.annual_price_cents);
            const annualNote = interval === "annual"
              ? annualData
                ? `Billed $${annualData.yearly.toFixed(2)}/year`
                : `Billed ${fmtCents(plan.annual_price_cents)}/year`
              : null;
            const isUp      = planOrder[plan.id] > planOrder[currentPlanId];
            const rows      = PLAN_ROWS[plan.id] ?? [];

            const btnLabel = isCurrent
              ? "Current plan"
              : isSamePlanDiffInterval
                ? interval === "annual" ? "Upgrade to Annual" : "Switch to Monthly"
                : isUp
                  ? `Upgrade to ${plan.name}`
                  : `Downgrade to ${plan.name}`;

            return (
              <Card key={plan.id} className={`p-6 relative flex flex-col ${isPopular ? "ring-2 ring-blue-600 shadow-xl" : ""} ${isCurrent ? "bg-slate-50/60" : ""}`}>
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="blue" className="px-3 py-1 text-xs font-semibold">Most popular</Badge>
                  </div>
                )}
                {plan.trial_days > 0 && !isCurrent && status !== "active" && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1">
                      {plan.trial_days}-day free trial
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isPopular ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                  {isCurrent && <Badge className="ml-auto text-xs">Current</Badge>}
                  {isSamePlanDiffInterval && interval === "annual" && (
                    <Badge className="ml-auto text-xs bg-emerald-50 text-emerald-700">Save {annualData?.savePct ?? 17}%</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mb-4">{PLAN_DESC[plan.id]}</p>

                <div className="mb-5">
                  <span className="text-4xl font-bold text-slate-900">{price}</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                  {annualNote && <p className="text-xs text-slate-400 mt-1">{annualNote}</p>}
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {rows.map((f) => (
                    <li key={f.label} className="flex items-start gap-2 text-sm">
                      {f.included
                        ? <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        : <X className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />}
                      <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.label}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrent ? "outline" : isPopular ? "primary" : "outline"}
                  className="w-full"
                  disabled={isCurrent || !isUp || checkoutPending}
                  onClick={() => isUp && !isCurrent && requestCheckout(plan.id)}
                >
                  {checkoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {btnLabel}
                </Button>
              </Card>
            );
          })}
        </div>

      </div>

      {/* ── Promotion history ───────────────────────────────────── */}
      {promotionHistory.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-5 w-5 text-pink-500" />
            <h3 className="font-semibold text-slate-900">Promotion history</h3>
          </div>
          <ul className="space-y-2">
            {promotionHistory.map((r) => (
              <li key={r.id} className="flex items-center justify-between flex-wrap gap-2 text-sm rounded-lg bg-slate-50 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-slate-800">{r.promotion?.code ?? "—"}</span>
                  <span className="text-slate-500 ml-2">{r.promotion?.description}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  {r.bonus_credits_granted > 0 && <span className="text-xs text-blue-600">+{r.bonus_credits_granted} credits</span>}
                  {r.bonus_leads_granted > 0 && <span className="text-xs text-emerald-600">+{r.bonus_leads_granted} leads</span>}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                    {r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Payment / portal ──────────────────────────────────── */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Payment methods & invoices</h3>
            <p className="text-sm text-slate-500">Managed securely through Stripe</p>
          </div>
          {hasPortal ? (
            <Button variant="outline" onClick={goPortal} disabled={portalPending}>
              {portalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open billing portal
            </Button>
          ) : (
            <Button variant="outline" onClick={() => requestCheckout("basic")} disabled={checkoutPending}>
              <CreditCard className="h-4 w-4" /> Add payment method
            </Button>
          )}
        </div>
        {hasPortal ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Billing managed via Stripe</p>
              <p className="text-xs text-slate-500 mt-0.5">Open the portal to view invoices, update cards, or change your plan.</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={goPortal} disabled={portalPending}>
              {portalPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Open portal
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <CreditCard className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No card on file</p>
            <p className="text-xs text-slate-500 mt-1">Subscribe to a plan to add a payment method via Stripe.</p>
          </div>
        )}
      </Card>

      {/* ── Success modal ─────────────────────────────────────── */}
      <Modal open={successOpen} onClose={() => setSuccessOpen(false)} title="" size="sm">
        <div className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <PartyPopper className="h-8 w-8 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Congratulations!</h2>
          <p className="text-slate-600 mb-1">
            Welcome to the <span className="font-semibold text-blue-600 capitalize">{successPlanName} Plan</span>!
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Your subscription is now active. You have <span className="font-semibold">{successCredits.toLocaleString()} AI credits</span> ready to use this cycle.
          </p>
          <Button className="w-full" onClick={() => { setSuccessOpen(false); router.push("/dashboard"); }}>
            Go to Dashboard
          </Button>
          <button onClick={() => setSuccessOpen(false)} className="mt-3 text-sm text-slate-400 hover:text-slate-600 w-full">
            Stay on billing page
          </button>
        </div>
      </Modal>

      {/* ── Cancel modal ──────────────────────────────────────── */}
      <Modal
        open={cancelOpen}
        onClose={() => { setCancelOpen(false); setCancelModalError(null); }}
        title={cancelAtPeriodEnd ? "Cancellation scheduled" : "Cancel subscription"}
        description={cancelAtPeriodEnd ? "You can resume any time before the period ends" : "Your plan stays active until the end of the current period"}
        size="sm"
      >
        <div className="p-5 space-y-4">
          {cancelAtPeriodEnd ? (
            <p className="text-sm text-slate-600">
              Your subscription is set to cancel on <span className="font-semibold text-slate-900">{periodEndDate ?? "the end of this period"}</span>.
              You&apos;ll keep full access until then. Changed your mind?
            </p>
          ) : canCancel ? (
            <p className="text-sm text-slate-600">
              {status === "trialing"
                ? "You won't be charged. Canceling now ends your trial immediately and your card will not be charged when the trial would have ended."
                : `You'll keep access until ${periodEndDate ?? "the end of the current period"}, then your subscription will end.`}
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              To cancel, email support@leadpro.ai and we&apos;ll process it promptly.
            </p>
          )}

          {cancelModalError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{cancelModalError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setCancelOpen(false); setCancelModalError(null); }}>Close</Button>
            {cancelAtPeriodEnd && (
              <Button onClick={resumeSubscription} disabled={cancelPending}>
                {cancelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Resume subscription
              </Button>
            )}
            {!cancelAtPeriodEnd && canCancel && (
              <Button variant="danger" onClick={confirmCancel} disabled={cancelPending}>
                {cancelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm cancel
              </Button>
            )}
            {!cancelAtPeriodEnd && !canCancel && (
              <a href="mailto:support@leadpro.ai?subject=Cancel subscription">
                <Button variant="danger">Email support</Button>
              </a>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Cancellation flow modal ───────────────────────────── */}
      <CancellationFlowModal
        open={cancellationFlowOpen}
        onClose={() => setCancellationFlowOpen(false)}
        subscription={sub ?? null}
      />

      {/* ── Plan terms gate ────────────────────────────────────── */}
      <PlanTermsModal
        open={termsOpen}
        planName={plans.find(p => p.id === pendingPlanId)?.name ?? pendingPlanId ?? ""}
        onClose={() => setTermsOpen(false)}
        onConfirm={confirmTermsAndCheckout}
        confirming={checkoutPending}
      />

      {/* AI billing helper — deliberately mounted here (not the global app
          shell) so it only ever appears on this page. */}
      <BillingSupportWidget subscription={sub} plans={plans} />
    </div>
  );
}
