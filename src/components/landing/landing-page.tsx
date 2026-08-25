"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronDown, Zap, Mail, BarChart3, Users,
  Inbox, Target, Bot, Play, X, CheckCircle2, Plus, Mic, ArrowUp,
  ArrowRight, Paperclip, Sparkles, Search, Send, Database,
  Cpu, Globe, Building2, ShieldCheck, Layers, Flame,
  Briefcase, Radio, MessageSquare, TrendingUp, Filter, CheckCheck
} from "lucide-react";
import { BookDemoModal } from "./book-demo-modal";
import { AiAssistantWidget } from "./ai-assistant-widget";
import type { LandingChatMessage } from "@/lib/ai/landing-chat";

export interface LandingPageNotice { kind: "signed_up" | "verified"; email?: string; }

function PostSignupNotice({ notice }: { notice: LandingPageNotice }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const loginHref = `/login${notice.email ? `?email=${encodeURIComponent(notice.email)}` : ""}`;
  const message = notice.kind === "signed_up" ? "Account created — log in to continue." : "Email verified — you can now log in.";
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-3 bg-blue-600 px-4 py-3 text-sm text-white font-bold shadow-2xl">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <span>{message}</span>
      <Link href={loginHref} className="rounded-lg px-4 py-1.5 bg-white text-blue-600 ml-2 font-semibold hover:bg-slate-100 transition-colors">Log in</Link>
      <button onClick={() => setHidden(true)} className="ml-4 hover:opacity-75"><X className="h-5 w-5" /></button>
    </div>
  );
}

function Navbar({ onBookDemo }: { onBookDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 20); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/90 backdrop-blur-md border-b border-slate-200/80 py-3.5 shadow-sm" : "bg-white py-5 border-b border-transparent"
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-5 sm:px-8 flex justify-between items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1f2223]">
            Nx<span className="text-blue-600">elio</span> <span className="text-slate-500 font-medium">Nurture</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          <a href="#capabilities" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">Capabilities</a>
          <a href="#comparison" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">Comparison</a>
          <a href="#playbooks" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">Playbooks</a>
          <a href="#integrations" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">Integrations</a>
          <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">Pricing</a>
          <a href="#faq" className="text-sm font-medium text-slate-600 hover:text-[#1f2223] transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 px-4 items-center justify-center rounded-full border border-slate-200/90 text-sm font-medium text-[#1f2223] hover:bg-slate-50 transition-colors"
          >
            Log In
          </Link>
          <button
            onClick={onBookDemo}
            className="inline-flex h-9 sm:h-10 px-4 sm:px-5 items-center justify-center gap-2 rounded-full bg-[#1f2223] text-white text-xs sm:text-sm font-semibold hover:bg-black transition-all shadow-sm hover:shadow active:scale-95"
          >
            <span>Start for Free</span>
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

const SAMPLE_PROMPTS = [
  "Find VPs of Sales at Series-A voice agent startups that shipped product in the last 6 months.",
  "Identify 100 Head of RevOps in the US using HubSpot and currently hiring SDRs.",
  "Track competitor accounts evaluating Gong and trigger a personalized intro email.",
  "Target e-commerce founders in Europe scaling beyond $5M ARR with high ad spend."
];

function HeroPromptSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LandingChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [activePromptIdx, setActivePromptIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function submit(textToSubmit?: string) {
    const text = (textToSubmit || input).trim();
    if (!text || pending) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setPending(true);
    setTimeout(() => router.push(`/login?prompt=${encodeURIComponent(text)}`), 650);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleChipClick(sampleText: string, idx: number) {
    setActivePromptIdx(idx);
    setInput(sampleText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  return (
    <div className="w-full max-w-[940px] mx-auto mt-8 sm:mt-12 text-left">
      {/* Glow frame container matching Lev8 */}
      <div className="relative rounded-[28px] sm:rounded-[34px] p-[2px] shadow-[0_20px_50px_rgba(0,0,0,0.08)] bg-gradient-to-r from-teal-400 via-indigo-500 to-amber-400">
        <div className="relative rounded-[26px] sm:rounded-[32px] bg-white p-4 sm:p-7 md:p-8 flex flex-col justify-between min-h-[220px] sm:min-h-[250px]">
          
          {/* Chat history if user enters a query */}
          {messages.length > 0 && (
            <div ref={scrollRef} className="max-h-60 overflow-y-auto space-y-3 mb-4 pr-1">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:text-base leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-[#1f2223] text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {pending && (
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-blue-50 text-blue-900 border border-blue-200 px-4 py-3 text-sm sm:text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>Searching live web intelligence — redirecting to workspace…</span>
                </div>
              )}
            </div>
          )}

          {/* Prompt textarea */}
          <div className="flex-1 flex flex-col justify-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Find VPs of Sales at Bay Area AI startups that shipped their product in the last year…"
              rows={3}
              spellCheck={false}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              style={{ outline: "none", border: "none", boxShadow: "none" }}
              className="hero-chat-textarea landing-hero-textarea border-0 border-none w-full bg-transparent text-[#1f2223] placeholder:text-slate-400 text-base sm:text-lg md:text-xl font-normal leading-relaxed resize-none outline-none ring-0 shadow-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none p-0"
            />
          </div>

          {/* Action toolbar */}
          <div className="pt-3 mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInput("Enrich my existing CSV lead list with verified emails and LinkedIn signals.")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Attach CSV / Leads"
                aria-label="Attach CSV or Leads"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => submit()}
              disabled={pending || !input.trim()}
              className="inline-flex h-10 px-5 items-center justify-center gap-2 rounded-xl rounded-tr-2xl rounded-bl-[4px] bg-[#1f2223] text-white text-sm font-medium hover:bg-black disabled:opacity-40 transition-all cursor-pointer shadow-md"
            >
              <span>Start for Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Clickable prompt suggestions underneath */}
      <div className="mt-4 flex items-center gap-2 flex-wrap justify-center text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Popular plays:</span>
        {SAMPLE_PROMPTS.slice(0, 3).map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleChipClick(p, idx)}
            className="rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 text-xs transition-colors truncate max-w-[280px] sm:max-w-none text-left"
          >
            "{p.slice(0, 42)}..."
          </button>
        ))}
      </div>
    </div>
  );
}

function Hero({ onBookDemo }: { onBookDemo: () => void }) {
  return (
    <section className="pt-32 sm:pt-40 pb-20 sm:pb-28 bg-white overflow-hidden text-center">
      <div className="max-w-[1360px] mx-auto px-5 sm:px-8">
        
        {/* Main Headline (Lev8 style) */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-semibold text-[#1f2223] leading-[1.12] tracking-tight max-w-4xl mx-auto">
          Turn the live web into <br className="hidden md:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
            people and revenue intelligence
          </span>
        </h1>

        {/* Capability Icons Bar (Lev8 signature pills) */}
        <ul className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2.5 mt-8 text-xs sm:text-sm font-medium text-slate-600">
          <li className="inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">🟣</span>
            <span className="text-slate-800">Find the right people</span>
          </li>
          <span className="hidden sm:inline text-slate-300">|</span>
          <li className="inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-xs">🔴</span>
            <span className="text-slate-800">Research buying signals</span>
          </li>
          <span className="hidden sm:inline text-slate-300">|</span>
          <li className="inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">🔵</span>
            <span className="text-slate-800">Launch personalized outbound</span>
          </li>
          <span className="hidden sm:inline text-slate-300">|</span>
          <li className="inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs">🟡</span>
            <span className="text-slate-800">Automate pipeline tasks</span>
          </li>
        </ul>

        {/* Lev8-Style Prompt Box Centerpiece */}
        <HeroPromptSearch />

        {/* Product proof badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="flex text-amber-400">★★★★★</span>
            <span className="font-semibold">4.9/5</span> on G2 & Capterra
          </div>
          <span className="text-slate-300">·</span>
          <div>Over <strong>350,000+</strong> verified decision makers found this month</div>
          <span className="text-slate-300">·</span>
          <div><strong>0 Setup time</strong> — Live in 2 minutes</div>
        </div>
      </div>
    </section>
  );
}

function TrustLogos() {
  return (
    <section className="py-12 border-y border-slate-100 bg-slate-50/50">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6">
          Powering outbound growth for modern B2B teams
        </p>
        <div className="flex justify-center items-center gap-8 sm:gap-14 md:gap-20 flex-wrap opacity-65 grayscale hover:grayscale-0 transition-all font-bold text-lg sm:text-xl text-slate-700">
          <span>TechFlow</span>
          <span>GrowthSync</span>
          <span>HyperScale</span>
          <span>VenturePeak</span>
          <span>CloudScale</span>
          <span>SaaSMetrics</span>
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  const [activeTab, setActiveTab] = useState(0);

  const capabilities = [
    {
      id: "prospecting",
      tabTitle: "One-Prompt Prospecting",
      badge: "Discovery",
      heading: "Search the live web for exact ICP matches in seconds.",
      description: "Stop relying on 6-month-old static databases. Nxelio deploys parallel AI agents to crawl live company websites, press releases, hiring boards, and social posts to find active decision makers.",
      features: [
        "Natural language query interface",
        "Live web scraping with zero stale records",
        "Filtered by hiring roles, recent funding, and tech stack"
      ],
      preview: {
        title: "Live Prospecting Query",
        query: "Found 124 VP-level leaders at AI startups expanding their European sales footprint.",
        metrics: [
          { label: "Precision", value: "98.4%" },
          { label: "Freshness", value: "Real-time" },
          { label: "Cost / Lead", value: "$0.04" }
        ]
      }
    },
    {
      id: "enrichment",
      tabTitle: "Waterfall Enrichment",
      badge: "Enrichment",
      heading: "Enrich every contact with verified work emails and direct dials.",
      description: "Our multi-provider waterfall ensures 95%+ email deliverability. Every contact record includes verified business email, LinkedIn URL, mobile number, company headcount, and revenue tier.",
      features: [
        "15+ data provider waterfall validation",
        "Zero-bounce email verification guarantee",
        "Direct company signals & LinkedIn sync"
      ],
      preview: {
        title: "Waterfall Contact Card",
        query: "Alex Rivera · VP Sales @ Synthetix AI\n✉️ alex.r@synthetix.ai (Verified 100% Deliverable)\n📱 +1 (415) 890-3211 · San Francisco, CA",
        metrics: [
          { label: "Deliverability", value: "99.1%" },
          { label: "Valid Phones", value: "84%" },
          { label: "Data Providers", value: "15+" }
        ]
      }
    },
    {
      id: "signals",
      tabTitle: "Live Buying Signals",
      badge: "Signals",
      heading: "Reach buyers at the exact moment their budget unlocks.",
      description: "Track trigger events that signal buying intent: new executive hires, funding rounds, new job postings for your buyer personas, and tech stack changes. Reach out before competitors even notice.",
      features: [
        "Track job openings and department growth",
        "Real-time funding and M&A alert triggers",
        "Competitor tool displacement alerts"
      ],
      preview: {
        title: "Active Trigger Alert",
        query: "Trigger Detected: ScaleUp Tech posted 4 new 'Account Executive' roles on LinkedIn 3 hours ago.\nAction: AI generated personalized congratulatory sequence.",
        metrics: [
          { label: "Signal Speed", value: "< 15 mins" },
          { label: "Response Lift", value: "+340%" },
          { label: "Trigger Accuracy", value: "96.7%" }
        ]
      }
    },
    {
      id: "outbound",
      tabTitle: "Autonomous Multi-Channel",
      badge: "Outreach",
      heading: "Hyper-personalized email & LinkedIn copy written for each prospect.",
      description: "No robotic templates. Nxelio AI drafts context-aware emails referencing their latest news, podcast appearances, and company pain points. Sent with smart inbox rotation to protect domain reputation.",
      features: [
        "1-to-1 personalized first lines and subject lines",
        "Automated multi-step follow-ups until booked",
        "Smart unified inbox handles objections automatically"
      ],
      preview: {
        title: "AI Drafted Outreach",
        query: "Subject: Congrats on the Series A, Alex — question on AE ramping\n\n'Hey Alex, saw your team just posted 4 AE roles following your $12M round. Usually sales ramps get bottlenecked by manual prospecting...'",
        metrics: [
          { label: "Open Rate", value: "78.2%" },
          { label: "Reply Rate", value: "14.6%" },
          { label: "Time Saved", value: "18 hrs/wk" }
        ]
      }
    }
  ];

  const current = capabilities[activeTab];

  return (
    <section id="capabilities" className="py-24 sm:py-32 bg-white">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            What Nxelio Handles For You
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1f2223] tracking-tight leading-tight">
            Here's what I actually handle for you.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Find the right people. Reach out with context. Track new buying signals. Automate what's next.
          </p>
        </div>

        {/* Interactive Capability Tabs (Lev8 style) */}
        <div className="flex justify-center mb-12 overflow-x-auto pb-2 scrollbar-none">
          <div className="inline-flex p-1.5 bg-slate-100 rounded-full border border-slate-200/80 max-w-full">
            {capabilities.map((cap, i) => (
              <button
                key={cap.id}
                onClick={() => setActiveTab(i)}
                className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === i
                    ? "bg-[#1f2223] text-white shadow-md"
                    : "text-slate-600 hover:text-[#1f2223]"
                }`}
              >
                {cap.tabTitle}
              </button>
            ))}
          </div>
        </div>

        {/* Feature showcase card */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 md:p-14 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          <div className="lg:col-span-6 text-left">
            <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold mb-4">
              {current.badge}
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-[#1f2223] leading-snug mb-4">
              {current.heading}
            </h3>
            <p className="text-slate-600 text-base leading-relaxed mb-6">
              {current.description}
            </p>

            <ul className="space-y-3 mb-8">
              {current.features.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-medium text-slate-800">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f2223] hover:text-blue-600 group"
            >
              <span>Explore this capability</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {current.preview.title}
                </span>
              </div>
              <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
                AI Agent Active
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 sm:p-5 font-mono text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100 mb-6">
              {current.preview.query}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              {current.preview.metrics.map((m, idx) => (
                <div key={idx} className="bg-slate-50/90 rounded-xl p-3 text-center border border-slate-100">
                  <div className="text-base sm:text-xl font-bold text-[#1f2223]">{m.value}</div>
                  <div className="text-[11px] font-medium text-slate-500 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function ProductComparison() {
  const comparisonRows = [
    {
      feature: "Data Freshness",
      nxelio: "Live Real-Time Web Scraping (< 1 day)",
      others: "Static Database (3–6 months old)",
      winner: true
    },
    {
      feature: "Prospecting Method",
      nxelio: "Natural Language Prompt ('Find Series A VPs')",
      others: "Manual Boolean filters & 40 dropdowns",
      winner: true
    },
    {
      feature: "Waterfall Email Deliverability",
      nxelio: "15+ Provider Waterfall (99% Guaranteed)",
      others: "Single provider (60–75% bounce risk)",
      winner: true
    },
    {
      feature: "Outreach Execution",
      nxelio: "Built-in Autonomous Sequences & Unified Inbox",
      others: "Requires 3 separate tools (Clay + Smartlead + CRM)",
      winner: true
    },
    {
      feature: "Time to First Campaign",
      nxelio: "Under 3 minutes",
      others: "2 to 4 weeks of webhook configuration",
      winner: true
    },
    {
      feature: "Total Monthly Cost",
      nxelio: "$49 / month all-inclusive",
      others: "$350–$800 / month across 4 tool subscriptions",
      winner: true
    }
  ];

  return (
    <section id="comparison" className="py-24 sm:py-32 bg-slate-50/70 border-t border-slate-200">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            Product Comparison
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1f2223] tracking-tight">
            Precise. Deeper. Wider. Faster. Cheaper.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Compare search accuracy, setup speed, and cost across the platforms GTM teams use for pipeline generation.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-100/70 p-4 sm:p-6 border-b border-slate-200 font-bold text-xs sm:text-sm uppercase tracking-wider text-slate-600">
            <div className="col-span-5 sm:col-span-4">Capability</div>
            <div className="col-span-4 sm:col-span-4 text-blue-600 flex items-center gap-1.5">
              <Zap className="w-4 h-4 fill-blue-600" />
              <span>Nxelio Nurture</span>
            </div>
            <div className="col-span-3 sm:col-span-4 text-slate-400">Legacy Tools / Clay / Apollo</div>
          </div>

          <div className="divide-y divide-slate-100">
            {comparisonRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 p-4 sm:p-6 items-center text-xs sm:text-sm hover:bg-slate-50/50 transition-colors">
                <div className="col-span-5 sm:col-span-4 font-semibold text-[#1f2223]">
                  {row.feature}
                </div>
                <div className="col-span-4 sm:col-span-4 text-slate-900 font-medium flex items-center gap-2 pr-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 stroke-[2.5]" />
                  <span>{row.nxelio}</span>
                </div>
                <div className="col-span-3 sm:col-span-4 text-slate-500 line-through decoration-slate-300">
                  {row.others}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/signup"
            className="inline-flex h-11 px-7 items-center justify-center gap-2 rounded-full bg-[#1f2223] text-white text-sm font-semibold hover:bg-black transition-transform hover:-translate-y-0.5 shadow-md"
          >
            <span>Replace your fragmented stack today</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}

function PlaybooksSection() {
  const plays = [
    {
      icon: "🎯",
      title: "Competitor Displacement",
      desc: "Monitor competitor pricing changes, downtime, or customer complaints. Automatically identify their users and pitch your solution with exact comparison data.",
      tag: "High Intent"
    },
    {
      icon: "👔",
      title: "New Executive Job Changes",
      desc: "70% of new VPs buy new software within their first 90 days. Get notified the day they update LinkedIn and send a warm onboarding congratulations.",
      tag: "Fast Close"
    },
    {
      icon: "📈",
      title: "Hiring Surge & Role Triggers",
      desc: "Detect companies opening 3+ roles in your target departments. Outbound to the hiring manager before their inbox gets flooded.",
      tag: "Budget Ready"
    },
    {
      icon: "⚡",
      title: "Funding & Expansion Signals",
      desc: "Target accounts right after their Seed, Series A, or Series B announcements with custom congratulatory outreach tailored to their new growth goals.",
      tag: "Fresh Capital"
    }
  ];

  return (
    <section id="playbooks" className="py-24 sm:py-32 bg-white">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            One Search · Every Opportunity
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1f2223] tracking-tight">
            Pick a play. Tell Nxelio to run it.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Run inbound qualification, competitor monitoring, executive job changes, and automated meeting booking with AI agents.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {plays.map((play, i) => (
            <div
              key={i}
              className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 hover:border-slate-300 rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:shadow-lg hover:-translate-y-1 text-left"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-2xl">
                    {play.icon}
                  </div>
                  <span className="text-[11px] font-semibold tracking-wide bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
                    {play.tag}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-[#1f2223] mb-2">{play.title}</h4>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-6">{play.desc}</p>
              </div>

              <div className="pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Run with AI Agent</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

function IntegrationsSection() {
  const tools = [
    { name: "Salesforce", category: "CRM", icon: "☁️" },
    { name: "HubSpot", category: "CRM", icon: "🟠" },
    { name: "Gmail / GSuite", category: "Email", icon: "✉️" },
    { name: "Microsoft 365", category: "Email", icon: "🟦" },
    { name: "LinkedIn Sales Nav", category: "Social", icon: "💼" },
    { name: "Slack", category: "Alerts", icon: "💬" },
    { name: "Zapier", category: "Automation", icon: "⚡" },
    { name: "Custom Webhooks", category: "API", icon: "🔗" }
  ];

  return (
    <section id="integrations" className="py-24 bg-slate-50/70 border-y border-slate-200">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 text-center">
        
        <div className="max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            Ecosystem & Native Sync
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1f2223] tracking-tight">
            I work where you work, integrating 1,000+ apps.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Zero setup. Connect Nxelio to your existing GTM stack and move verified research directly into the systems your team already uses.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {tools.map((t, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-3.5 text-left shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="text-2xl">{t.icon}</div>
              <div>
                <div className="font-bold text-sm text-[#1f2223]">{t.name}</div>
                <div className="text-xs text-slate-400">{t.category}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

function TestimonialsSection() {
  const [current, setCurrent] = useState(0);
  const quotes = [
    {
      text: "Nxelio Nurture replaced our entire SDR team's tech stack. We're booking 3.4x more qualified demos while cutting software costs by $1,200 every month.",
      author: "Sarah Jenkins",
      role: "VP of Revenue, TechFlow",
      metric: "3.4x Demo Volume"
    },
    {
      text: "The real-time live web search is incredible. It finds hiring signals and verified contact emails that Apollo and ZoomInfo missed completely.",
      author: "Marcus Reed",
      role: "Founder & CEO, GrowthSync",
      metric: "+$64k New ARR in 60 Days"
    },
    {
      text: "Having discovery, email sequences, and a smart unified inbox in one place saved our sales reps 18 hours of repetitive busywork every single week.",
      author: "Elena Rodriguez",
      role: "Head of RevOps, ScaleB2B",
      metric: "70% Time Saved"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => setCurrent((c) => (c + 1) % quotes.length), 6000);
    return () => clearInterval(timer);
  }, [quotes.length]);

  return (
    <section className="py-24 sm:py-32 bg-white overflow-hidden">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center">
        
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
          Customer Results
        </p>
        <h2 className="text-3xl sm:text-4xl font-semibold text-[#1f2223] tracking-tight mb-14">
          Loved by fast-growing revenue teams.
        </h2>

        <div className="relative min-h-[220px] flex items-center justify-center">
          {quotes.map((q, i) => (
            <div
              key={i}
              className={`transition-opacity duration-500 absolute inset-0 flex flex-col justify-center items-center ${
                i === current ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full mb-5 border border-emerald-200">
                {q.metric}
              </div>
              <p className="text-xl sm:text-2xl md:text-3xl font-medium text-[#1f2223] leading-relaxed mb-6 max-w-3xl">
                "{q.text}"
              </p>
              <div className="font-bold text-base text-slate-900">{q.author}</div>
              <div className="text-xs sm:text-sm text-slate-500">{q.role}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {quotes.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-3 h-3 rounded-full transition-colors cursor-pointer ${
                i === current ? "bg-[#1f2223]" : "bg-slate-200 hover:bg-slate-300"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      q: "How is Nxelio different from static databases like ZoomInfo or Apollo?",
      a: "Traditional databases rely on stale lists that are updated only once every few months. Nxelio uses parallel AI agents to search the live web in real time, validating current employee titles, company announcements, tech stack changes, and hiring signals right when you query."
    },
    {
      q: "How does the 7-day free trial work?",
      a: "You get full access to Nxelio Nurture for 7 days without commitment. Discover verified leads, launch personalized multi-step sequences, test AI agents, and manage replies risk-free. No credit card is required to get started."
    },
    {
      q: "Can I bring my existing CSV list or sync my CRM?",
      a: "Yes! You can import existing CSV prospect lists or integrate natively with Salesforce, HubSpot, or custom webhooks. Nxelio will enrich your list with verified emails, phones, and live company signals."
    },
    {
      q: "How does email deliverability and spam protection work?",
      a: "Nxelio includes automated inbox warmup, domain rotation, bounce-rate protection, and AI tone check to ensure your emails consistently hit the primary inbox rather than promotions or spam folders."
    },
    {
      q: "Do I need technical skills or complex Zapier tables?",
      a: "None at all. Nxelio is built as a single, intuitive platform with zero setup needed. Just type what kind of accounts you need in natural English, and the AI handles the discovery, enrichment, copy drafting, and sending."
    }
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-slate-50/70 border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <h2 className="text-3xl sm:text-4xl font-semibold text-center text-[#1f2223] tracking-tight mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full px-6 py-5 flex items-center justify-between text-left text-[#1f2223] font-semibold text-base sm:text-lg hover:bg-slate-50/50 transition-colors cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 text-slate-400 transition-transform shrink-0 ml-4 ${
                    openIdx === idx ? "rotate-180 text-slate-700" : ""
                  }`}
                />
              </button>
              {openIdx === idx && (
                <div className="px-6 pb-6 text-slate-600 text-sm sm:text-base leading-relaxed bg-white border-t border-slate-50">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DramaticBottomCTAAndFooter() {
  return (
    <section className="rounded-t-[36px] sm:rounded-t-[48px] md:rounded-t-[56px] bg-[#121417] px-5 sm:px-10 lg:px-20 pb-12 pt-16 md:pt-24 text-white">
      <div className="max-w-[1280px] mx-auto flex flex-col">
        
        {/* Massive Lev8-Style Bottom CTA */}
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-8 mb-20 md:mb-28">
          <div>
            <p className="text-sm sm:text-lg text-slate-400 line-through decoration-slate-400 mb-3">
              Stop buying 5 fragmented sales tools.
            </p>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-semibold leading-tight tracking-tight">
              The fastest way to <br />
              <span className="text-amber-400">find and close anyone.</span>
            </h2>
          </div>

          <Link
            href="/signup"
            className="group inline-flex items-center gap-3 sm:gap-5 rounded-full border-2 sm:border-4 border-white/90 p-1.5 sm:p-2 pr-5 sm:pr-8 text-white transition-all hover:border-amber-400 hover:bg-amber-400 hover:text-black cursor-pointer shadow-2xl"
          >
            <span className="flex size-12 sm:size-16 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black transition-colors group-hover:bg-black group-hover:text-amber-400">
              <ArrowRight className="size-6 sm:size-8" strokeWidth={2.5} />
            </span>
            <span className="text-xl sm:text-3xl md:text-4xl font-semibold">
              Start your 7-day free trial
            </span>
          </Link>

          <p className="text-xs sm:text-sm text-slate-400">
            No credit card required · Setup in under 2 minutes · Cancel anytime
          </p>
        </div>

        {/* Divider */}
        <hr className="h-px w-full border-0 bg-white/10 mb-14" />

        {/* Structured Multi-Column Footer (Lev8 style) */}
        <footer className="w-full">
          <div className="grid grid-cols-2 min-[430px]:grid-cols-3 md:grid-cols-5 gap-8 mb-16 text-left">
            
            <div className="col-span-2 min-[430px]:col-span-3 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
                  ⚡
                </div>
                <span className="text-lg font-bold tracking-tight text-white">Nxelio</span>
              </Link>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                Your AI radar for companies ready to buy. Live web prospect intelligence, enrichment, and multi-channel outreach.
              </p>
              <div className="text-xs text-slate-500">
                &copy; {new Date().getFullYear()} Nxelio Inc. All rights reserved.
              </div>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Capabilities</p>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">One-Prompt Prospecting</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Waterfall Enrichment</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Live Buying Signals</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Multi-Channel Outbound</a>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Compare</p>
              <a href="#comparison" className="text-slate-400 hover:text-white transition-colors">Nxelio vs. Clay</a>
              <a href="#comparison" className="text-slate-400 hover:text-white transition-colors">Nxelio vs. Apollo</a>
              <a href="#comparison" className="text-slate-400 hover:text-white transition-colors">Nxelio vs. ZoomInfo</a>
              <a href="#comparison" className="text-slate-400 hover:text-white transition-colors">Nxelio vs. Manual SDRs</a>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Playbooks</p>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Competitor Displacement</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Executive Job Changes</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Hiring Triggers</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Funding Announcements</a>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Company</p>
              <a href="#faq" className="text-slate-400 hover:text-white transition-colors">FAQ</a>
              <Link href="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
              <Link href="/signup" className="text-slate-400 hover:text-white transition-colors">Get Started</Link>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">Privacy & Terms</a>
            </div>

          </div>
        </footer>

      </div>
    </section>
  );
}

export function LandingPage({ notice }: { notice?: LandingPageNotice | null } = {}) {
  const [showDemoModal, setShowDemoModal] = useState(false);

  return (
    <div className="landing-page min-h-screen font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden text-[#1f2223] bg-white">
      {notice && <PostSignupNotice notice={notice} />}
      <Navbar onBookDemo={() => setShowDemoModal(true)} />
      <Hero onBookDemo={() => setShowDemoModal(true)} />
      <TrustLogos />
      <CapabilitiesSection />
      <ProductComparison />
      <PlaybooksSection />
      <IntegrationsSection />
      <TestimonialsSection />
      <FAQSection />
      <DramaticBottomCTAAndFooter />

      <BookDemoModal open={showDemoModal} onClose={() => setShowDemoModal(false)} />
      <AiAssistantWidget />
    </div>
  );
}
