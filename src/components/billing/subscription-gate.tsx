"use client";
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Full-screen block shown instead of the dashboard when a workspace has no
 * subscription at all (brand new signup, no card added yet). Routes into the
 * same Chargebee checkout used everywhere else — Basic Monthly's item price
 * has its own 7-day trial configured, so completing this checkout is what
 * starts the trial. No charge happens today.
 */
export function SubscriptionGate() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTrial() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "basic", billingInterval: "monthly" }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
          <CreditCard className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Add a payment method to continue</h1>
        <p className="text-sm text-slate-500 mb-6">
          Start your 7-day Basic trial — full access to Basic features, nothing charged today. Cancel anytime before the trial ends.
        </p>
        <Button onClick={startTrial} disabled={pending} className="w-full justify-center">
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</> : "Add payment method"}
        </Button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>
    </div>
  );
}
