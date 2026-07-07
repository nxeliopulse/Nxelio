"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowRight, Check, Mail, Users2, Workflow, BarChart3, Layers3, Newspaper,
  Bot, Zap, Lock, AtSign, Globe, Code2, Star
} from "lucide-react";
import { Logo } from "@/components/brand/logo";

const features = [
  { icon: Bot, title: "AI Lead Scoring", desc: "Every lead is automatically scored across 4 dimensions — company fit, opportunity, contact access, and competitive position.", accent: "from-purple-500 to-pink-500" },
  { icon: Mail, title: "AI-Personalized Outreach", desc: "Generate cold email sequences that reference the prospect's company, role, and recent activity — written by AI, ready in 3 seconds.", accent: "from-blue-500 to-indigo-500" },
  { icon: Newspaper, title: "Newsletters to Subscribers", desc: "Send rich content updates to your existing leads with block-based editor, images, AI writing, and live preview.", accent: "from-emerald-500 to-teal-500" },
  { icon: Workflow, title: "Visual Workflow Builder", desc: "Drag-and-drop automation canvas. Trigger emails, score updates, and alerts when leads take action — 24/7.", accent: "from-amber-500 to-orange-500" },
  { icon: Layers3, title: "Smart Segments", desc: "Build dynamic audiences with AND/OR rule logic. Segments auto-update as new leads arrive.", accent: "from-rose-500 to-red-500" },
  { icon: BarChart3, title: "Conversion Analytics", desc: "Real-time funnel tracking, engagement charts, campaign A/B insights, and exportable reports.", accent: "from-cyan-500 to-blue-500" },
];

const steps = [
  { num: "1", title: "Capture leads", desc: "Share your unique form URL, embed it on your site, or import a CSV. Every lead routes to your private workspace." },
  { num: "2", title: "AI does the research", desc: "Each lead gets scored, profiled, and suggested decision-makers — all without you opening a single tab." },
  { num: "3", title: "Convert with confidence", desc: "Launch AI-written outreach campaigns, send newsletter updates, and watch replies stream into Smart Inbox." },
];

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-700">
            <Link href="#features" className="hover:text-blue-600 transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-blue-600 transition-colors">How it works</Link>
            <Link href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</Link>
            <Link href="/help" className="hover:text-blue-600 transition-colors">Resources</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="px-3 sm:px-4 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Start free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 -left-32 w-96 h-96 bg-blue-200/40 rounded-full blur-3xl" />
          <div className="absolute top-40 -right-32 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-96 bg-indigo-100/50 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered lead nurturing platform
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.05] max-w-5xl mx-auto">
            The CRM that
            <span className="block mt-2">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                writes its own emails
              </span>
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Nxelio scores your leads with AI, drafts personalized outreach, sends polished newsletters,
            and automates follow-ups — so your team focuses on closing, not typing.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              Get started — free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-900 text-base font-semibold rounded-xl border border-slate-200 transition-colors"
            >
              Log in
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-500">No credit card required · 5,000 AI credits free · Setup in 60 seconds</p>

          {/* Stats strip */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-600">
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 ring-2 ring-white" />
                ))}
              </div>
              <span className="font-medium">2,400+ teams</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
              <span className="font-medium">4.9 / 5 average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">SOC 2-ready architecture</span>
            </div>
          </div>
        </div>

        {/* Dashboard preview — actual product screenshot */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Browser chrome */}
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="ml-4 flex-1 max-w-md mx-auto bg-white border border-slate-200 rounded-md px-3 py-1 text-xs text-slate-500 text-center">
                  app.nxelio.ai/dashboard
                </div>
              </div>

              {/* Actual product screenshot */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dashboard-preview.png"
                alt="Nxelio dashboard showing KPIs, lead growth chart, and campaign performance"
                className="w-full h-auto block"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold mb-4">
              Built for modern revenue teams
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
              Everything you need to turn cold leads into hot pipeline
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Six modules, one workspace, zero spreadsheets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all"
                >
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${f.accent} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-4">
              From zero to revenue in 3 steps
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">How Nxelio works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={s.num} className="relative">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 h-full">
                  <div className="text-7xl font-black bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent leading-none">
                    {s.num}
                  </div>
                  <h3 className="text-xl font-bold mt-4 mb-2">{s.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden md:block absolute top-1/2 -right-4 h-6 w-6 text-slate-300 -translate-y-1/2 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-gradient-to-b from-slate-50 to-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mb-4">
              Simple, honest pricing
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Pick a plan, grow your pipeline</h2>
            <p className="mt-4 text-lg text-slate-600">Start free. Upgrade when you&apos;re ready.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: "Free", price: "0", desc: "Get started", features: ["1,000 leads", "5,000 AI credits / mo", "25,000 emails / mo", "Basic workflows"], cta: "Get started", featured: false },
              { name: "Pro", price: "29", desc: "For growing teams", features: ["25,000 leads", "100,000 AI credits / mo", "250,000 emails / mo", "Advanced workflows", "Priority support", "Custom domain sender"], cta: "Upgrade to Pro", featured: true },
              { name: "Business", price: "99", desc: "For scaling companies", features: ["Unlimited leads", "Unlimited AI credits", "Unlimited emails", "Advanced workflows", "Priority support", "Custom domain sender", "API access"], cta: "Upgrade to Business", featured: false },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-6 ${p.featured ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl scale-105 border-2 border-blue-500" : "bg-white border border-slate-200"}`}
              >
                {p.featured && <div className="inline-block px-2 py-0.5 bg-white/20 text-xs font-semibold rounded mb-2">Most popular</div>}
                <p className={`text-sm ${p.featured ? "text-blue-100" : "text-slate-500"}`}>{p.name}</p>
                <p className={`text-xs mb-3 ${p.featured ? "text-blue-100" : "text-slate-500"}`}>{p.desc}</p>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-4xl font-bold">${p.price}</span>
                  <span className={p.featured ? "text-blue-100" : "text-slate-500"}>/mo</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className={`h-4 w-4 ${p.featured ? "text-blue-200" : "text-emerald-500"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block w-full text-center px-4 py-2.5 rounded-lg font-semibold transition-colors ${
                    p.featured ? "bg-white text-blue-700 hover:bg-blue-50" : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-10 sm:p-16 text-center text-white">
            <div className="absolute inset-0 -z-10">
              <div className="absolute top-0 left-1/4 w-72 h-72 bg-blue-500/30 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-purple-500/30 rounded-full blur-3xl" />
            </div>
            <Sparkles className="h-10 w-10 mx-auto mb-4 text-blue-300" />
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-2xl mx-auto">
              Stop typing emails. Start closing deals.
            </h2>
            <p className="mt-4 text-lg text-blue-100 max-w-xl mx-auto">
              Set up your workspace in 60 seconds. 5,000 AI credits free, forever.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-white text-slate-900 text-base font-semibold rounded-xl hover:bg-blue-50 transition-colors"
              >
                Get started — free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white text-base font-semibold rounded-xl backdrop-blur transition-colors border border-white/20"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <Logo />
              <p className="mt-3 text-sm text-slate-600 max-w-xs">
                AI-powered lead nurturing & customer engagement for modern B2B teams.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <a href="mailto:harirajanncse@gmail.com" className="p-2 rounded-lg hover:bg-slate-200 text-slate-600" title="Email us"><AtSign className="h-4 w-4" /></a>
                <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-slate-200 text-slate-600" title="LinkedIn"><Globe className="h-4 w-4" /></a>
                <a href="https://github.com/Harirajan06/nxelio" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-slate-200 text-slate-600" title="GitHub"><Code2 className="h-4 w-4" /></a>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Product</p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="#features" className="hover:text-slate-900">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-slate-900">Pricing</Link></li>
                <li><Link href="#how-it-works" className="hover:text-slate-900">How it works</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Company</p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="/help" className="hover:text-slate-900">Help center</Link></li>
                <li><Link href="/privacy" className="hover:text-slate-900">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-slate-900">Terms</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Account</p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="/login" className="hover:text-slate-900">Log in</Link></li>
                <li><Link href="/signup" className="hover:text-slate-900">Sign up</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <p>© 2026 Nxelio. All rights reserved.</p>
            <p>Built with AI · Powered by Supabase, Groq & Brevo</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
