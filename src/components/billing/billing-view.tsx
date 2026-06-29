"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, X, Sparkles, CreditCard, Users2, Send,
  Zap, Crown, Rocket, Lock, AlertTriangle, Clock,
  TrendingUp, RefreshCw, ExternalLink, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import type {
  SubscriptionWithPlan, SubscriptionPlan, BillingInterval,
} from "@/lib/queries/subscriptions";

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

// ── Plan display config ───────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ElementType> = {
  basic: Zap, starter: Rocket, pro: Crown,
};
const PLAN_DESC: Record<string, string> = {
  basic:   "Bring your own leads",
  starter: "For growing pipelines",
  pro:     "Highest volume + replies",
};

const PLAN_ROWS: Record<string, Array<{ label: string; included: boolean }>> = {
  basic: [
    { label: "~150 AI credits / mo",     included: true  },
    { label: "Import your own leads",    included: true  },
    { label: "Enrichment + scoring",     included: true  },
    { label: "LinkedIn outreach",        included: true  },
    { label: "Core workflows",           included: true  },
    { label: "Lead discovery",           included: false },
    { label: "CRM export",              included: false },
    { label: "Reply tracking",           included: false },
  ],
  starter: [
    { label: "1,000 AI credits / mo",    included: true  },
    { label: "Automated lead discovery", included: true  },
    { label: "Full enrichment + scoring",included: true  },
    { label: "LinkedIn outreach",        included: true  },
    { label: "CRM export",              included: true  },
    { label: "Core workflows",           included: true  },
    { label: "Reply tracking",           included: false },
    { label: "Priority support",         included: false },
  ],
  pro: [
    { label: "2,500 AI credits / mo",    included: true  },
    { label: "Everything in Starter",    included: true  },
    { label: "Reply tracking",           included: true  },
    { label: "Priority support",         included: true  },
  ],
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
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BillingView({ subscription: sub, plans, leadsCount, sentCount }: Props) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkoutPending, startCheckout] = useTransition();
  const [portalPending, startPortal] = useTransition();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const currentPlanId = sub?.plan_id ?? "basic";
  const status        = sub?.status  ?? "trialing";
  const credRemaining = sub?.credits_remaining ?? 0;
  const credTotal     = sub?.credits_total     ?? 150;
  const credUsed      = credTotal - credRemaining;
  const pct           = credPct(credRemaining, credTotal);
  const low           = isLow(credRemaining, credTotal);
  const daysLeft      = trialDaysLeft(sub?.trial_ends_at ?? null);
  const hasPortal     = Boolean(sub?.chargebee_customer_id);

  const planOrder: Record<string, number> = { basic: 0, starter: 1, pro: 2 };

  // ── Actions ────────────────────────────────────────────────

  function goCheckout(planId: string) {
    setCheckoutError(null);
    startCheckout(async () => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingInterval: interval }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setCheckoutError(json.error ?? "Checkout failed"); return; }
      window.location.href = json.url;
    });
  }

  function goPortal() {
    startPortal(async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) { setCheckoutError(json.error ?? "Portal failed"); return; }
      window.location.href = json.url;
    });
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto">
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
            <p className="text-xs text-red-600 mt-0.5">All AI operations are paused. Upgrade or buy a top-up pack.</p>
          </div>
          <Button size="sm" onClick={() => setTopUpOpen(true)}>Top up credits</Button>
        </div>
      )}
      {low && credRemaining > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{credRemaining} credits remaining — running low</p>
            <p className="text-xs text-amber-600 mt-0.5">Less than 10% of your monthly allowance.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTopUpOpen(true)}>Top up</Button>
        </div>
      )}
      {status === "trialing" && daysLeft > 0 && daysLeft <= 3 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-5 py-4">
          <Clock className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">Trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
            <p className="text-xs text-blue-600 mt-0.5">Choose a plan to keep your workspace active.</p>
          </div>
          <Button size="sm" onClick={() => goCheckout("starter")}>Choose a plan</Button>
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
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 p-8 text-white">
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
              </div>
              <h2 className="text-4xl font-bold">
                {sub ? fmtCents(sub.plan.monthly_price_cents) : "$8.99"}
                <span className="text-xl font-normal text-blue-100">/mo</span>
              </h2>
              <p className="text-blue-100 mt-2 max-w-md text-sm">
                {status === "trialing"
                  ? "You're in your 7-day free trial. No card required — pick a plan when you're ready."
                  : `${sub?.plan.name ?? "Basic"} plan · renews ${sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasPortal && (
                <Button
                  variant="outline"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                  onClick={goPortal}
                  disabled={portalPending}
                >
                  {portalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage billing
                </Button>
              )}
              <Button
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  const next = plans.find(p => planOrder[p.id] > planOrder[currentPlanId]);
                  if (next) goCheckout(next.id);
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
        <div className="px-8 py-5 border-t border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
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
            <button onClick={() => setTopUpOpen(true)} className="text-xs text-blue-600 hover:underline font-medium">
              Buy more credits →
            </button>
          </div>
        </div>
      </Card>

      {/* ── Usage cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "AI credits used", Icon: Sparkles, used: credUsed,   total: credTotal,  color: "from-blue-500 to-indigo-600",  bar: "bg-blue-600",    hasBar: true },
          { label: "Leads",           Icon: Users2,   used: leadsCount,  total: 0,         color: "from-emerald-500 to-teal-600", bar: "bg-emerald-600", hasBar: false },
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
      <div className="mb-8">
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
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">2 months free</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const Icon      = PLAN_ICONS[plan.id] ?? Zap;
            const isCurrent = plan.id === currentPlanId;
            const isPopular = plan.id === "starter";
            const price     = interval === "monthly" ? fmtCents(plan.monthly_price_cents) : annualMonthly(plan.annual_price_cents);
            const annualNote = interval === "annual" ? `Billed ${fmtCents(plan.annual_price_cents)}/year` : null;
            const isUp      = planOrder[plan.id] > planOrder[currentPlanId];
            const rows      = PLAN_ROWS[plan.id] ?? [];

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
                  disabled={isCurrent || checkoutPending}
                  onClick={() => !isCurrent && goCheckout(plan.id)}
                >
                  {checkoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isCurrent ? "Current plan" : isUp ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Feature gate notes */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
            <Lock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Lead Discovery is Starter+</p>
              <p className="text-xs text-amber-700 mt-0.5">Phase 01 discovery is off on Basic. Upload your own lists or upgrade.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-purple-50 border border-purple-100 rounded-xl p-4">
            <Lock className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-purple-900">Reply Tracking is Pro only</p>
              <p className="text-xs text-purple-700 mt-0.5">Opens, clicks, and reply inbox — upgrade to Pro to unlock.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment / portal ──────────────────────────────────── */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Payment methods & invoices</h3>
            <p className="text-sm text-slate-500">Managed securely through Chargebee + Stripe</p>
          </div>
          {hasPortal ? (
            <Button variant="outline" onClick={goPortal} disabled={portalPending}>
              {portalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open billing portal
            </Button>
          ) : (
            <Button variant="outline" onClick={() => goCheckout("basic")} disabled={checkoutPending}>
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
              <p className="text-sm font-medium text-slate-900">Billing managed via Chargebee</p>
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
            <p className="text-xs text-slate-500 mt-1">Subscribe to a plan to add a payment method via Chargebee.</p>
          </div>
        )}
      </Card>

      <div className="text-center py-4">
        <button
          onClick={() => setCancelOpen(true)}
          className="text-sm text-slate-400 hover:text-red-600 underline underline-offset-4"
        >
          Cancel subscription
        </button>
      </div>

      {/* ── Top-up modal ──────────────────────────────────────── */}
      <Modal open={topUpOpen} onClose={() => setTopUpOpen(false)} title="Buy extra credits" description="Added to your balance immediately — expire at cycle end" size="sm">
        <div className="p-5 space-y-3">
          {TOP_UP_PACKS.map((pack) => (
            <div key={pack.credits} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
              onClick={() => {
                setTopUpOpen(false);
                goCheckout("basic"); // placeholder — wire to top-up checkout when ready
              }}
            >
              <div>
                <p className="font-semibold text-slate-900 text-sm">{pack.label}</p>
                <p className="text-xs text-slate-500">{pack.per}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{fmtCents(pack.price_cents)}</p>
                <p className="text-xs text-slate-400">one-time</p>
              </div>
            </div>
          ))}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2 text-xs text-slate-600">
            <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Top-up credits expire at the end of your current billing cycle. Charged via Chargebee + Stripe.
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel modal ──────────────────────────────────────── */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel subscription" description="Your plan stays active until the end of the current period" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            {status === "trialing"
              ? "You're on a free trial — nothing to cancel. Your trial will expire naturally."
              : hasPortal
              ? "You can cancel directly from the billing portal. Your access continues until the period ends."
              : `To cancel, email support@leadpro.ai and we'll process it promptly.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Close</Button>
            {status !== "trialing" && hasPortal && (
              <Button variant="danger" onClick={() => { setCancelOpen(false); goPortal(); }} disabled={portalPending}>
                {portalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Open billing portal
              </Button>
            )}
            {status !== "trialing" && !hasPortal && (
              <a href="mailto:support@leadpro.ai?subject=Cancel subscription">
                <Button variant="danger">Email support</Button>
              </a>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
