"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { askBillingSupport, type BillingSupportMessage, type BillingSupportPlanSummary } from "@/lib/ai/billing-support";
import type { SubscriptionPlan, SubscriptionWithPlan } from "@/lib/queries/subscription-types";

const QUICK_QUESTIONS = [
  "What's the difference between the plans?",
  "What happens if I cancel?",
  "How do AI credits work?",
  "How do I update my payment method?",
];

function planFeatureList(plan: SubscriptionPlan): string[] {
  const f = plan.features;
  const list: string[] = [`${plan.credits_per_cycle.toLocaleString()} AI credits/month`];
  list.push(f.discovery ? `${plan.leads_per_cycle.toLocaleString()} AI-discovered leads/month` : "bring your own leads (CSV import)");
  if (f.enrichment) list.push("AI enrichment");
  if (f.scoring) list.push("AI scoring");
  if (f.linkedin_outreach) list.push("LinkedIn outreach");
  if (f.reply_tracking) list.push("reply tracking");
  if (f.meetings) list.push("meetings & calendar sync");
  if (f.opportunities) list.push("opportunities pipeline");
  list.push(f.priority_support ? "priority support" : "standard support");
  return list;
}

/**
 * Floating AI helper scoped ONLY to the Subscription page (mounted directly
 * inside BillingView, not the global app shell) — answers plan/pricing/
 * credits/cancellation questions using this workspace's real, live
 * subscription data instead of guessed numbers.
 */
export function BillingSupportWidget({ subscription, plans }: { subscription: SubscriptionWithPlan | null; plans: SubscriptionPlan[] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<BillingSupportMessage[]>([]);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function ask(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    const next: BillingSupportMessage[] = [...chat, { role: "user", content: message }];
    setChat(next);
    start(async () => {
      const planSummaries: BillingSupportPlanSummary[] = plans.map((p) => ({
        name: p.name,
        monthlyPriceCents: p.monthly_price_cents,
        annualPriceCents: p.annual_price_cents,
        features: planFeatureList(p),
      }));
      const res = await askBillingSupport(next, {
        planName: subscription?.plan.name ?? "No active plan",
        status: subscription?.status ?? "none",
        interval: subscription?.billing_interval ?? "monthly",
        creditsRemaining: subscription?.credits_remaining ?? 0,
        creditsTotal: subscription?.credits_total ?? 0,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
        periodEnd: subscription?.current_period_end ?? null,
        plans: planSummaries,
      });
      setChat((c) => [...c, { role: "assistant", content: res.error || res.reply }]);
    });
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-24 sm:right-6 z-50 w-full sm:w-[380px] sm:max-w-[92vw]">
          <div className="lp-anim-pop origin-bottom sm:origin-bottom-right bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[75vh] sm:max-h-[65vh] overflow-hidden">
            <div className="bg-indigo-600 text-white p-4 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight">Billing Assistant</p>
                  <p className="text-white/75 text-xs">Ask about plans, credits & billing</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close billing assistant" className="p-1 rounded-md hover:bg-white/15 flex-shrink-0">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-slate-50">
              {chat.length === 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5">Quick questions</p>
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="w-full bg-white rounded-xl border border-slate-200 p-2.5 text-left text-sm font-medium text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {chat.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white text-slate-800 border border-slate-200 shadow-xs"}`}>
                    <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 p-2">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> Checking your subscription...
                </div>
              )}
            </div>

            <div className="p-3 bg-white border-t border-slate-200">
              <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask a billing question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="Send"
                  className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => { setOpen((v) => !v); if (!open) setTimeout(() => inputRef.current?.focus(), 100); }}
        aria-label={open ? "Close billing assistant" : "Open billing assistant"}
        title="Billing Assistant"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-900/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </>
  );
}
