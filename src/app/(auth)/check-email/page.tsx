"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck, ArrowLeft, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

function CheckEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "your email";
  const [resending, setResending] = useState(false);
  const [resentOk, setResentOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setResending(true);
    setError(null);
    setResentOk(false);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (resendError) setError(resendError.message);
      else setResentOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setResending(false);
    }
  }

  // Provider-specific quick-jump
  const provider = email.split("@")[1]?.toLowerCase() || "";
  const providerLink =
    provider.includes("gmail") ? "https://mail.google.com" :
    provider.includes("outlook") || provider.includes("hotmail") || provider.includes("live") ? "https://outlook.live.com" :
    provider.includes("yahoo") ? "https://mail.yahoo.com" :
    null;

  return (
    <div>
      <button onClick={() => router.push("/login")} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-blue-400 mb-6 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </button>

      <div className="mb-6">
        <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-400/25 flex items-center justify-center mb-4 text-blue-300">
          <MailCheck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
          Check your inbox
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
          We sent a confirmation link to{" "}
          <span className="font-semibold text-slate-200">{email}</span>.
          Click the link to finish signing in.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs sm:text-sm text-red-700 mb-4">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resentOk && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs sm:text-sm text-emerald-700 mb-4">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>A new confirmation link is on its way.</span>
        </div>
      )}

      {providerLink && (
        <a
          href={providerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-sm font-bold shadow-md shadow-blue-500/30 transition-all mb-3"
        >
          Open {provider.includes("gmail") ? "Gmail" : provider.includes("outlook") || provider.includes("hotmail") || provider.includes("live") ? "Outlook" : "Yahoo Mail"}
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <button
        type="button"
        onClick={resend}
        disabled={resending}
        className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10 transition-all cursor-pointer disabled:opacity-50"
      >
        {resending ? "Resending…" : "Resend confirmation email"}
      </button>

      <div className="mt-8 p-4 bg-white/[0.04] rounded-lg border border-white/10 text-sm text-slate-300">
        <p className="font-semibold text-slate-200 mb-1">Didn&apos;t see it?</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>Check your spam / promotions folder</li>
          <li>The link expires in 1 hour — request a new one if needed</li>
          <li>Make sure {email} is correct (typos happen)</li>
        </ul>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading...</div>}>
      <CheckEmailContent />
    </Suspense>
  );
}
