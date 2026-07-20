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
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="font-semibold text-white flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-400" /> AI Provider</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Debug switch — pick which AI provider powers every AI feature (AI Assistant, lead scoring, email generation, support/landing chat) across the whole platform. Takes effect immediately, no redeploy.
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["openai", "groq"] as const).map((p) => {
            const info = PROVIDER_INFO[p];
            const cfg = status.providers.find((x) => x.provider === p);
            const isActive = active === p;
            return (
              <button
                key={p}
                onClick={() => switchTo(p)}
                disabled={pending}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  isActive ? "border-blue-500 bg-blue-500/10" : "border-slate-800 hover:border-slate-700"
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{info.label}</span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400"><Check className="h-3.5 w-3.5" /> Active</span>
                  ) : switching === p ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-xs text-slate-500">Switch</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">{info.envHint}</p>
                <p className={`text-xs mt-1 ${cfg?.configured ? "text-emerald-400" : "text-amber-400"}`}>
                  {cfg?.configured ? "API key configured" : "No API key set — add it to env vars"}
                </p>
              </button>
            );
          })}
        </div>
        {status.updatedAt && (
          <div className="px-4 pb-4 text-xs text-slate-500">
            Last changed {new Date(status.updatedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 p-4">
        <h4 className="font-medium text-white text-sm">Send a test message</h4>
        <p className="text-xs text-slate-400 mt-0.5 mb-3">Sends a minimal ping to whichever provider is active right now, to confirm the key/model work.</p>
        <button
          onClick={runTest}
          disabled={pending || testState?.loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {testState?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test message
        </button>
        {testState && !testState.loading && (
          <div className={`mt-3 rounded-lg border p-3 text-xs ${testState.error ? "border-red-900 bg-red-950/40 text-red-300" : "border-emerald-900 bg-emerald-950/40 text-emerald-300"}`}>
            {testState.error ? `Error: ${testState.error}` : `Reply: ${testState.reply || "(empty)"}`}
          </div>
        )}
      </div>
    </div>
  );
}
