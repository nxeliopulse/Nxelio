import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";

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
      <header className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/"><Logo /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>

        <nav className="mt-6 flex gap-1 border-b border-slate-200">
          {AGREEMENT_PAGES.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active === p.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-2">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 flex items-center justify-between">
          <span>© 2026 Nxelio Nurture. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
