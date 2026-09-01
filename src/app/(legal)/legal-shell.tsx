import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";

const AGREEMENT_PAGES = [
  { id: "privacy", label: "Privacy Policy", href: "/privacy" },
  { id: "terms", label: "Terms of Service", href: "/terms" },
] as const;

export function LegalShell({
  title,
  updated,
  active,
  children,
}: {
  title: string;
  updated: string;
  /** Which agreement page is currently shown — highlights the matching nav tab. */
  active: "privacy" | "terms";
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page min-h-screen bg-white text-slate-900">
      {/* Floating glass pill navbar — the same shape/style as the landing
          page's top nav (rounded-full, white/glass, shadow), just without
          the marketing links (Features/Pricing/etc. don't apply here) and
          with a "Back home" action in place of Log In / Start Free Trial. */}
      <div className="px-3 sm:px-6 lg:px-8 pt-4 sm:pt-5">
        <div className="max-w-[1380px] mx-auto rounded-full bg-white/90 backdrop-blur-xl border border-white/85 shadow-xl shadow-black/5 py-3.5 sm:py-4 px-6 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <Zap className="w-5 h-5 fill-white" />
              </div>
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f2223]">
                Nx<span className="text-blue-600">elio</span> <span className="text-slate-500 font-medium text-sm sm:text-base">Nurture</span>
              </span>
            </Link>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-semibold text-slate-700 border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back home
            </Link>
          </div>
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>

        <nav className="mt-6 flex gap-1 border-b border-slate-200">
          {AGREEMENT_PAGES.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              className="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={
                active === p.id
                  ? { borderColor: "#1447e6", color: "#1447e6" }
                  : { borderColor: "transparent", color: "#64748b" }
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-2">
          {children}
        </div>
      </main>
      <footer className="bg-[#0a0a0d]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-400 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} Nxelio Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
