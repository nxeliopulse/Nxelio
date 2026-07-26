"use client";
import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles, Send } from "lucide-react";
import { setActiveAiProvider, sendAiProviderTestMessage, type AiProviderStatus } from "@/lib/queries/ai-provider-settings";
import type { AiProviderName } from "@/lib/ai/provider";

const PROVIDER_INFO: Record<AiProviderName, { label: string; envHint: string }> = {
  openai: { label: "OpenAI", envHint: "OPENAI_API_KEY / OPENAI_MODEL" },
  groq: { label: "Groq", envHint: "GROQ_API_KEY / GROQ_MODEL" },
};

export function AiProviderTab({ status }: { status: AiProviderStatus }) {
  const [active, setActive] = useState(status.activeProvider);
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState<AiProviderName | null>(null);
  const [testState, setTestState] = useState<{ loading: boolean; reply?: string; error?: string } | null>(null);

  function switchTo(provider: AiProviderName) {
    if (provider === active || pending) return;
    setSwitching(provider);
    startTransition(async () => {
      const res = await setActiveAiProvider(provider);
      if (res.ok) {
        setActive(provider);
        setTestState(null);
      }
      setSwitching(null);
    });
  }

  function runTest() {
    setTestState({ loading: true });
    startTransition(async () => {
      const res = await sendAiProviderTestMessage();
      setTestState(res.ok ? { loading: false, reply: res.reply } : { loading: false, error: res.error });
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-amber-500 fill-amber-500/20" /> AI Provider
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Debug switch &mdash; pick which AI provider powers every AI feature (AI Assistant, lead scoring, email generation, support/landing chat) across the whole platform. Takes effect immediately, no redeploy.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["openai", "groq"] as const).map((p) => {
            const info = PROVIDER_INFO[p];
            const cfg = status.providers.find((x) => x.provider === p);
            const isActive = active === p;
            return (
              <button
                key={p}
                onClick={() => switchTo(p)}
                disabled={pending}
                className={`text-left rounded-2xl p-5 transition-all ${
                  isActive
                    ? "border-2 border-[#18A7B8] bg-[#18A7B8]/5 dark:bg-[#18A7B8]/10 shadow-sm relative"
                    : "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-base">{info.label}</span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#18A7B8] px-3 py-1 rounded-full shadow-sm">
                      <Check className="h-3.5 w-3.5 stroke-[3]" /> Active
                    </span>
                  ) : switching === p ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Switch</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-3">{info.envHint}</p>
                <p className={`text-xs mt-1 font-semibold ${cfg?.configured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {cfg?.configured ? "✓ API key configured" : "⚠ No API key set — add it to env vars"}
                </p>
              </button>
            );
          })}
        </div>
        {status.updatedAt && (
          <div className="px-5 pb-5 text-xs text-slate-400 dark:text-slate-500 font-medium">
            Last changed {new Date(status.updatedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h4 className="font-bold text-slate-900 dark:text-white text-base">Send a test message</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
          Sends a minimal ping to whichever provider is active right now, to confirm the key/model work.
        </p>
        <button
          onClick={runTest}
          disabled={pending || testState?.loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#18A7B8] hover:bg-[#14929f] text-white px-5 py-2.5 text-xs font-bold shadow-sm transition-all disabled:opacity-50"
        >
          {testState?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test message
        </button>
        {testState && !testState.loading && (
          <div
            className={`mt-4 rounded-xl border p-4 text-xs font-mono shadow-inner ${
              testState.error
                ? "border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200"
                : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200"
            }`}
          >
            {testState.error ? `Error: ${testState.error}` : `Reply: ${testState.reply || "(empty)"}`}
          </div>
        )}
      </div>
    </div>
  );
}
