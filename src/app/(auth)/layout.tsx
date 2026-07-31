import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

function AssistantIllustration() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed decorative illustration, not worth Next/Image's constraints here
    <img src="/illustrations/assistant-bot.png" alt="" className="w-full max-w-[280px] drop-shadow-2xl" />
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light-theme min-h-screen relative overflow-hidden bg-white flex items-center justify-center p-4 lg:p-0">

      {/* ── RIGHT: curved color panel with the agent illustration ── */}
      <div className="hidden lg:block absolute inset-y-0 right-0 w-[56%]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#18A7B8" />
              <stop offset="100%" stopColor="#5B3FA6" />
            </linearGradient>
          </defs>
          <path d="M32,0 C0,18 0,34 24,50 C0,66 0,82 32,100 L100,100 L100,0 Z" fill="url(#panelGrad)" />
        </svg>

        {/* Decorative floating shapes bleeding across the curve */}
        <div className="absolute bottom-16 left-10 h-16 w-16 rounded-2xl rotate-12" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="absolute bottom-10 left-24 h-10 w-10 rounded-xl -rotate-6" style={{ background: "rgba(255,255,255,.18)" }} />
        <div className="absolute top-16 right-24 h-8 w-8 rounded-full" style={{ background: "rgba(255,255,255,.15)" }} />

        <div className="relative h-full flex flex-col items-center justify-center px-16 text-center">
          <h2 className="text-3xl font-black text-white leading-tight mb-3">
            Let&apos;s turn every lead<br />into real pipeline.
          </h2>
          <p className="text-sm text-white/70 mb-8 max-w-[280px]">
            Your AI-powered co-pilot for finding leads, running campaigns, and closing deals.
          </p>
          <AssistantIllustration />
        </div>
      </div>

      {/* ── LEFT: floating white form card ── */}
      <div className="relative z-10 w-full max-w-md sm:max-w-lg lg:absolute lg:left-[6%] lg:top-1/2 lg:-translate-y-1/2 lg:max-w-[520px] my-6 lg:my-0">
        <div className="bg-white rounded-[28px] shadow-2xl p-6 sm:p-7 lg:p-7"
          style={{ boxShadow: "0 30px 70px rgba(30,20,90,.25)" }}>
          <Link href="/" className="flex items-center gap-2 mb-3.5">
            <div className="h-7 w-7 rounded-lg overflow-hidden flex-shrink-0 bg-white shadow-sm ring-1 ring-slate-900/5 flex items-center justify-center">
              <LogoMark className="h-full w-full" />
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight">Nxelio Nurture</span>
          </Link>

          {children}

          <div className="mt-3 pt-2 text-center text-[10px] border-t border-slate-100 text-slate-400">
            Protected · SOC 2-ready · GDPR · Workspace-isolated data
          </div>
        </div>
      </div>
    </div>
  );
}
