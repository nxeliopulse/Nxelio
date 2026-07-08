"use client";
import { useState } from "react";
import {
  Check,
  X,
  Sparkles,
  CreditCard,
  Users2,
  Send,
  Zap,
  Crown,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

interface Credits {
  used: number;
  total: number;
}

interface Props {
  credits: Credits;
  leadsCount: number;
  sentCount: number;
}

const LEADS_LIMIT = 1000;
const EMAILS_LIMIT = 25000;

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/mo",
    icon: Zap,
    description: "For getting started",
    features: [
      { label: "1,000 leads", included: true },
      { label: "5,000 AI credits / mo", included: true },
      { label: "25,000 emails / mo", included: true },
      { label: "Basic workflows", included: true },
      { label: "Priority support", included: false },
      { label: "Custom domain sender", included: false },
      { label: "API access", included: false },
    ],
    cta: "Current plan",
    popular: false,
    current: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/mo",
    icon: Crown,
    description: "For growing teams",
    features: [
      { label: "25,000 leads", included: true },
      { label: "100,000 AI credits / mo", included: true },
      { label: "250,000 emails / mo", included: true },
      { label: "Advanced workflows", included: true },
      { label: "Priority support", included: true },
      { label: "Custom domain sender", included: true },
      { label: "API access", included: false },
    ],
    cta: "Upgrade to Pro",
    popular: true,
    current: false,
  },
  {
    id: "business",
    name: "Business",
    price: "$99",
    period: "/mo",
    icon: Building2,
    description: "For scaling companies",
    features: [
      { label: "Unlimited leads", included: true },
      { label: "Unlimited AI credits", included: true },
      { label: "Unlimited emails", included: true },
      { label: "Advanced workflows", included: true },
      { label: "Priority support", included: true },
      { label: "Custom domain sender", included: true },
      { label: "API access", included: true },
    ],
    cta: "Upgrade to Business",
    popular: false,
    current: false,
  },
];

export function BillingView({ credits, leadsCount, sentCount }: Props) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const usages = [
    {
      label: "AI credits",
      icon: Sparkles,
      used: credits.used,
      total: credits.total,
      color: "from-blue-500 to-indigo-600",
      barColor: "bg-blue-600",
    },
    {
      label: "Leads",
      icon: Users2,
      used: leadsCount,
      total: LEADS_LIMIT,
      color: "from-emerald-500 to-teal-600",
      barColor: "bg-emerald-600",
    },
    {
      label: "Emails sent",
      icon: Send,
      used: sentCount,
      total: EMAILS_LIMIT,
      color: "from-purple-500 to-pink-600",
      barColor: "bg-purple-600",
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Billing & subscription"
        description="Manage your plan, usage, and payment methods"
      />

      {/* Hero current-plan card */}
      <Card className="overflow-hidden mb-6">
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 text-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-white/20 text-white ring-1 ring-white/30" variant="default">
                  Current plan
                </Badge>
                <Badge className="bg-white/20 text-white ring-1 ring-white/30" variant="default">
                  Free
                </Badge>
              </div>
              <h2 className="text-4xl font-bold tracking-tight">
                $0<span className="text-xl font-normal text-blue-100">/mo</span>
              </h2>
              <p className="text-blue-100 mt-2 max-w-md">
                You&apos;re on the Free plan. Upgrade for higher limits, premium support, and
                custom sender domains.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => setUpgradeOpen(true)}
              >
                <Sparkles className="h-4 w-4" /> Upgrade plan
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Usage progress */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {usages.map((u) => {
          const pct = Math.min(100, Math.round((u.used / u.total) * 100));
          const Icon = u.icon;
          return (
            <Card key={u.label} className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`h-10 w-10 rounded-lg bg-gradient-to-br ${u.color} text-white flex items-center justify-center`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{u.label}</p>
                  <p className="text-xs text-slate-500">
                    {u.used.toLocaleString()} / {u.total.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${u.barColor} rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">{pct}% used this cycle</p>
            </Card>
          );
        })}
      </div>

      {/* Pricing comparison */}
      <div className="mb-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Choose the right plan</h2>
          <p className="text-slate-500 mt-1">Upgrade anytime — cancel anytime</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const Icon = p.icon;
            return (
              <Card
                key={p.id}
                className={`p-6 relative ${
                  p.popular ? "ring-2 ring-blue-600 shadow-lg" : ""
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="blue" className="px-3 py-1 text-xs font-semibold">
                      Most popular
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                      p.popular ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg text-slate-900">{p.name}</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">{p.description}</p>
                <div className="mb-5">
                  <span className="text-3xl font-bold text-slate-900">{p.price}</span>
                  <span className="text-slate-500">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {p.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />
                      )}
                      <span
                        className={f.included ? "text-slate-700" : "text-slate-400"}
                      >
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={p.current ? "outline" : p.popular ? "primary" : "outline"}
                  className="w-full"
                  disabled={p.current}
                  onClick={() => !p.current && setUpgradeOpen(true)}
                >
                  {p.cta}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment methods */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Payment methods</h3>
            <p className="text-sm text-slate-500">Cards used for subscription billing</p>
          </div>
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            <CreditCard className="h-4 w-4" /> Add payment method
          </Button>
        </div>
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <CreditCard className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No card on file</p>
          <p className="text-xs text-slate-500 mt-1">
            Add a payment method to upgrade your plan
          </p>
        </div>
      </Card>

      {/* Cancel link */}
      <div className="text-center py-4">
        <button
          onClick={() => setCancelOpen(true)}
          className="text-sm text-slate-500 hover:text-red-600 underline underline-offset-4"
        >
          Cancel subscription
        </button>
      </div>

      {/* Upgrade modal */}
      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Upgrade plan"
        description="Self-service billing is on the way"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-2 text-sm text-blue-900">
            <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Stripe integration coming soon. In the meantime, contact{" "}
              <a href="mailto:sales@leadpro.ai" className="font-semibold underline">
                sales@leadpro.ai
              </a>{" "}
              to upgrade your workspace.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Close
            </Button>
            <a href="mailto:sales@leadpro.ai">
              <Button>Email sales</Button>
            </a>
          </div>
        </div>
      </Modal>

      {/* Payment modal */}
      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Add payment method"
        description="Securely store a card for subscription billing"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            Card capture via Stripe Elements is coming soon. Reach out to{" "}
            <a href="mailto:sales@leadpro.ai" className="font-semibold underline">
              sales@leadpro.ai
            </a>{" "}
            to enable billing for your workspace today.
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel subscription"
        description="We&apos;re sorry to see you considering this"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            You&apos;re currently on the Free plan, so there&apos;s nothing to cancel. If you
            previously upgraded, contact{" "}
            <a href="mailto:support@leadpro.ai" className="font-semibold underline">
              support@leadpro.ai
            </a>{" "}
            and we&apos;ll process the cancellation right away.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
