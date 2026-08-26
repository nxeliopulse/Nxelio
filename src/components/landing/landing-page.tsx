"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronDown, Zap, Mail, BarChart3, Users,
  Inbox, Target, Bot, Play, X, CheckCircle2, Plus, Mic, ArrowUp,
  ArrowRight, Paperclip, Sparkles, Search, Send, Database,
  Cpu, Globe, Building2, ShieldCheck, Layers, Flame,
  Briefcase, Radio, MessageSquare, TrendingUp, Filter, CheckCheck,
  Phone, Calendar, Megaphone, Contact, FileText, Link2, Clock,
  DollarSign, PieChart, Sparkle, UserCheck, RefreshCw, Eye
} from "lucide-react";
import { BookDemoModal } from "./book-demo-modal";
import { AiAssistantWidget } from "./ai-assistant-widget";
import { TestimonialsBentoSection } from "./testimonials-bento";
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
    function onScroll() { setScrolled(window.scrollY > 60); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-white/40 dark:border-slate-800 py-3 shadow-lg shadow-blue-900/5"
          : "bg-white/35 backdrop-blur-md py-5 border-b border-white/20"
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center gap-3">
        
        {/* Left: Brand Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1f2223] dark:text-white">
            Nx<span className="text-blue-600">elio</span> <span className="text-slate-500 font-medium text-sm sm:text-base">Nurture</span>
          </span>
        </Link>

        {/* Center: When Scrolled -> "7 Days Free Trial Claim" Offer Pill; When Not Scrolled -> Standard Nav Links */}
        <div className="hidden md:flex items-center justify-center transition-all duration-300">
          {scrolled ? (
            <div className="animate-fade-in flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 dark:from-blue-950/60 dark:to-emerald-950/60 border border-blue-200/80 dark:border-blue-800 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                🎉 Claim Your 7-Day Free Trial
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                Full AI Access · No Setup Fee
              </span>
            </div>
          ) : (
            <nav className="flex items-center gap-6 lg:gap-8">
              <a href="#features" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Features</a>
              <a href="#capabilities" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Capabilities</a>
              <a href="#testimonials" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Reviews</a>
              <a href="#playbooks" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Playbooks</a>
              <a href="#integrations" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Integrations</a>
              <a href="#pricing" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">Pricing</a>
              <a href="#faq" className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">FAQ</a>
            </nav>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 px-3.5 items-center justify-center rounded-full border border-slate-200/80 dark:border-slate-700 text-xs sm:text-sm font-medium text-[#1f2223] dark:text-white hover:bg-white/80 transition-colors"
          >
            Log In
          </Link>

          {scrolled ? (
            /* Scrolled CTA -> High-converting "Claim 7-Day Free Trial" Button */
            <Link
              href="/signup"
              className="inline-flex h-9 sm:h-10 px-4 sm:px-5 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-fade-in"
            >
              <Sparkles className="w-3.5 h-3.5 fill-amber-300 text-amber-300 animate-star-twinkle" />
              <span>Claim 7 Days Free</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          ) : (
            /* Initial CTA -> Start Free Trial Button */
            <Link
              href="/signup"
              className="inline-flex h-9 sm:h-10 px-4 sm:px-5 items-center justify-center gap-2 rounded-full bg-[#1f2223] dark:bg-white text-white dark:text-slate-950 text-xs sm:text-sm font-semibold hover:bg-black dark:hover:bg-slate-100 transition-all shadow-sm hover:shadow hover:scale-102 active:scale-95 cursor-pointer"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          )}
        </div>

      </div>
    </header>
  );
}

const SAMPLE_PROMPTS = [
  "Find VPs of Sales at Series-A AI companies in California with verified emails.",
  "Identify companies actively hiring Account Executives with direct phone numbers.",
  "Create an automated 4-step email sequence for prospective B2B clients.",
  "Build a segmented audience of tech founders with deal size above $25k."
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
      <div className="relative rounded-[28px] sm:rounded-[34px] p-[2px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] bg-gradient-to-r from-amber-300 via-white to-cyan-300">
        <div className="relative rounded-[26px] sm:rounded-[32px] bg-white p-4 sm:p-7 md:p-8 flex flex-col justify-between min-h-[220px] sm:min-h-[250px]">
          
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
                  <span>Processing with Nxelio Nurture AI — redirecting to workspace…</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 flex flex-col justify-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Find VPs of Sales at high-growth tech companies with verified emails and phone numbers…"
              rows={3}
              spellCheck={false}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              style={{ outline: "none", border: "none", boxShadow: "none" }}
              className="hero-chat-textarea landing-hero-textarea border-0 border-none w-full bg-transparent text-[#1f2223] placeholder:text-slate-400 text-base sm:text-lg md:text-xl font-normal leading-relaxed resize-none outline-none ring-0 shadow-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none p-0"
            />
          </div>

          <div className="pt-3 mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInput("Upload my CSV contact list, enrich missing details, and enroll into an outreach sequence.")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Import CSV or Leads"
                aria-label="Import CSV or Leads"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-xs text-slate-500 hidden sm:inline">Ask AI or attach CSV</span>
            </div>

            <button
              type="button"
              onClick={() => submit()}
              disabled={pending || !input.trim()}
              className="inline-flex h-10 px-5 items-center justify-center gap-2 rounded-xl rounded-tr-2xl rounded-bl-[4px] bg-[#1f2223] text-white text-sm font-medium hover:bg-black disabled:opacity-40 transition-all cursor-pointer shadow-md"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap justify-center text-xs text-blue-100">
        <span className="font-semibold text-white">Try asking:</span>
        {SAMPLE_PROMPTS.slice(0, 3).map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleChipClick(p, idx)}
            className="rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/25 px-3 py-1 text-xs transition-colors truncate max-w-[280px] sm:max-w-none text-left backdrop-blur-sm shadow-sm cursor-pointer"
          >
            {`"${p.slice(0, 42)}..."`}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hero({ onBookDemo }: { onBookDemo: () => void }) {
  return (
    <section className="pt-32 sm:pt-40 pb-20 sm:pb-28 overflow-hidden text-center bg-transparent">
      <div className="max-w-[1360px] mx-auto px-5 sm:px-8">

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-semibold text-white leading-[1.12] tracking-tight max-w-4xl mx-auto">
          The all-in-one AI platform to <br className="hidden md:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-200 to-cyan-200">
            find leads, run outreach & close deals
          </span>
        </h1>

        <ul className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2.5 mt-8 text-xs sm:text-sm font-medium text-blue-50">
          <li className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-3 py-1">
            <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center font-bold text-xs">🎯</span>
            <span>Verified Prospect Discovery</span>
          </li>
          <li className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-3 py-1">
            <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center font-bold text-xs">✉️</span>
            <span>Multichannel Campaigns & Inbox</span>
          </li>
          <li className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-3 py-1">
            <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center font-bold text-xs">💼</span>
            <span>Visual Deal Pipeline CRM</span>
          </li>
          <li className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-3 py-1">
            <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center font-bold text-xs">📅</span>
            <span>Integrated Calendar & Meetings</span>
          </li>
        </ul>

        <HeroPromptSearch />

        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-blue-50 font-medium">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span><strong className="text-white">7-day free trial</strong> — Credit card required</span>
          </div>
          <span className="text-white/30">·</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-amber-300" />
            <span><strong className="text-white">Zero setup delay</strong> — Ready in 2 minutes</span>
          </div>
          <span className="text-white/30">·</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-300" />
            <span><strong className="text-white">15+ data providers</strong> — Waterfall verified</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CoreFeaturesGrid() {
  const cards = [
    {
      pillIcon: Search,
      pillLabel: "Lead Discovery",
      pillClass: "bg-blue-50 text-blue-700",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      Icon: Search,
      heading: "Live Prospecting & Verified Jobs",
      desc: "Find ideal buyers by title, company size, and real-time job openings. Enrich every record with verified work emails and direct phone numbers.",
      image: "/illustrations/landing-prospecting.png",
      preview: (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 mb-3">
            <Sparkles className="w-3.5 h-3.5" /> AI Discovered Leads
          </div>
          <div className="space-y-2.5">
            {["Alex Rivera · VP Sales", "Dana Kim · Head of RevOps"].map((row) => (
              <div key={row} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-slate-200 shrink-0" />
                <span className="text-xs font-medium text-slate-700 truncate">{row}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {["Verified Email", "Direct Phone", "Hiring Trigger"].map((tag) => (
              <span key={tag} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      pillIcon: Send,
      pillLabel: "Outreach Engine",
      pillClass: "bg-indigo-50 text-indigo-700",
      iconBg: "bg-gradient-to-br from-indigo-500 to-purple-600",
      Icon: Send,
      heading: "Automated Sequences & Shared Inbox",
      desc: "Build personalized multi-step email campaigns with automated follow-ups, deliverability warmup, and a unified inbox to manage all prospect replies.",
      image: "/illustrations/landing-outreach.png",
      preview: (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-4">
          <div className="flex gap-1.5 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
          </div>
          <div className="space-y-2 mb-4">
            <div className="h-2.5 bg-slate-100 rounded-full w-3/4" />
            <div className="h-2.5 bg-slate-100 rounded-full w-1/2" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 text-[11px] text-slate-400">
              Personalized follow-up step 2…
            </div>
            <span className="h-9 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-semibold flex items-center shrink-0">Send</span>
          </div>
        </div>
      ),
    },
    {
      pillIcon: Briefcase,
      pillLabel: "Deal Management",
      pillClass: "bg-emerald-50 text-emerald-700",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
      Icon: Briefcase,
      heading: "Kanban Pipeline & Opportunities",
      desc: "Track deals from first contact to close. Manage stages, forecast revenue, sync calendar meetings, and monitor pipeline velocity in real time.",
      image: "/illustrations/landing-analytics.png",
      preview: (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-emerald-500 px-3 py-1.5 rounded-full mb-4">
            Deal: $36,000 ARR
          </span>
          <div className="w-px h-4 bg-slate-200" />
          <div className="grid grid-cols-3 gap-3 w-full mt-1">
            {[
              { icon: Target, label: "Discovery" },
              { icon: Mail, label: "Proposal" },
              { icon: CheckCheck, label: "Closed Won" },
            ].map(({ icon: StepIcon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <StepIcon className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-28 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            The Complete GTM Platform
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Everything your sales team needs to win.
          </h2>
          <p className="text-base text-blue-50 mt-3">
            Stop switching between 5 different tools. Nxelio Nurture combines lead research, automated outreach, CRM pipelines, and booking in one place.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-5 items-stretch">
          {cards.map((card, i) => {
            const featured = i === 1;
            const PillIcon = card.pillIcon;
            return (
              <div
                key={card.heading}
                className={`rounded-3xl p-6 sm:p-7 flex flex-col transition-transform landing-glass-card hover-lift-card ${
                  featured
                    ? "border-2 border-blue-400/80 shadow-2xl md:-translate-y-3"
                    : "shadow-lg"
                }`}
              >
                <span className={`inline-flex self-start items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 ${card.pillClass}`}>
                  <PillIcon className="w-3.5 h-3.5" /> {card.pillLabel}
                </span>

                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center shadow-sm shrink-0`}>
                    <card.Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1f2223]">{card.heading}</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">{card.desc}</p>

                <div className="mb-5 flex justify-center items-center h-44 bg-slate-50/90 rounded-2xl p-3 border border-slate-100 overflow-hidden group">
                  <img
                    src={card.image}
                    alt={card.heading}
                    className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                <div className="mt-auto">{card.preview}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AITeamSection() {
  const agents = [
    {
      pillLabel: "Prospect & Enrich",
      pillClass: "bg-blue-50 text-blue-700",
      avatarBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      Avatar: Search,
      BadgeIcon: Target,
      badgeBg: "bg-blue-600",
      name: "AI Prospector",
      desc: "Finds high-fit decision makers, tracks verified job openings, and validates emails with multi-provider waterfall lookups.",
    },
    {
      pillLabel: "Draft & Personalize",
      pillClass: "bg-amber-50 text-amber-700",
      avatarBg: "bg-gradient-to-br from-amber-500 to-orange-600",
      Avatar: Bot,
      BadgeIcon: Megaphone,
      badgeBg: "bg-amber-600",
      name: "AI Copywriter & Sequencer",
      desc: "Drafts high-converting cold email sequences, personalized opening lines, follow-ups, and newsletter broadcasts tailored to your audience.",
    },
    {
      pillLabel: "Schedule & Close",
      pillClass: "bg-purple-50 text-purple-700",
      avatarBg: "bg-gradient-to-br from-purple-500 to-fuchsia-600",
      Avatar: Calendar,
      BadgeIcon: Clock,
      badgeBg: "bg-purple-600",
      name: "AI Scheduler & CRM Copilot",
      desc: "Automates calendar booking with Google and Outlook sync, creates Zoom meetings, and gives proactive pipeline tips on active deals.",
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Intelligent Copilot
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Built-in AI working across every workflow.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            From discovering leads to drafting emails and booking calls, AI accelerates every part of your revenue cycle.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="landing-glass-card rounded-3xl p-6 sm:p-7 transition-all duration-300 hover:shadow-2xl hover-lift-card"
            >
              <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full mb-6 ${agent.pillClass}`}>
                {agent.pillLabel}
              </span>

              <div className="flex items-center gap-3 mb-4">
                <div className="relative shrink-0">
                  <div className={`w-14 h-14 rounded-2xl ${agent.avatarBg} flex items-center justify-center shadow-sm`}>
                    <agent.Avatar className="w-6 h-6 text-white" />
                  </div>
                  <span className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full ${agent.badgeBg} flex items-center justify-center ring-2 ring-white`}>
                    <agent.BadgeIcon className="w-3 h-3 text-white" />
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#1f2223]">{agent.name}</h3>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  const [activeTab, setActiveTab] = useState(0);

  const capabilities = [
    {
      id: "prospects",
      tabTitle: "Prospects & Verified Jobs",
      badge: "Lead Discovery",
      image: "/illustrations/landing-prospecting.png",
      heading: "Find decision makers and track active hiring signals.",
      description: "Search for target accounts by job titles, location, and verified company job postings. Import custom CSV lists or discover new prospects directly in Nxelio Nurture.",
      features: [
        "Natural language prospect search and bulk company lookup",
        "Verified hiring jobs crawler to identify accounts ready to buy",
        "Instant CSV import and export with automatic field mapping"
      ],
      preview: {
        title: "Prospect Discovery Query",
        query: "Found 86 Head of Sales & VP RevOps profiles matching:\n• Tech sector · 50–500 employees\n• Currently hiring SDRs & AEs\n• Verified work emails & phones included",
        metrics: [
          { label: "Data Quality", value: "Verified" },
          { label: "Hiring Signals", value: "Live" },
          { label: "CSV Import", value: "Instant" }
        ]
      }
    },
    {
      id: "enrichment",
      tabTitle: "Waterfall Enrichment",
      badge: "Data Verification",
      image: "/illustrations/landing-analytics.png",
      heading: "Enrich contacts with 15+ waterfall data providers.",
      description: "Validate work emails and phone numbers across multiple verification layers. Keep your bounce rates near zero and protect your sender reputation.",
      features: [
        "Multi-provider waterfall email verification",
        "Direct phone numbers and LinkedIn profile sync",
        "Detailed firmographics: company size, industry, and annual revenue"
      ],
      preview: {
        title: "Enriched Contact Record",
        query: "Alex Rivera · VP Sales @ Synthetix\n✉️ alex.r@synthetix.ai (100% Deliverable)\n📱 +1 (415) 890-3211 · San Francisco, CA\n💼 Headcount: 140 · Revenue: $18M ARR",
        metrics: [
          { label: "Deliverability", value: "99%" },
          { label: "Waterfall", value: "15+ Sources" },
          { label: "Direct Dials", value: "Included" }
        ]
      }
    },
    {
      id: "campaigns",
      tabTitle: "Campaigns & Sequences",
      badge: "Outreach & Inbound",
      image: "/illustrations/landing-outreach.png",
      heading: "Automated cold email sequences with dynamic variables.",
      description: "Build multi-step email campaigns with automated delay steps, variable tags, domain warmup, and inbox threading. Every campaign includes its own reply management tab.",
      features: [
        "Visual sequence builder with customizable delays and triggers",
        "Dynamic personalization tags (firstName, company, job title)",
        "Unified campaign inbox to view, label, and reply to leads"
      ],
      preview: {
        title: "Active Sequence",
        query: "Step 1: AI-Personalized Intro (Day 1)\nStep 2: Case Study Follow-up (Day 4)\nStep 3: Quick Value Check (Day 8)\nStatus: 64% Open Rate · 18% Reply Rate",
        metrics: [
          { label: "Open Rate", value: "64%" },
          { label: "Reply Rate", value: "18%" },
          { label: "Mailbox Sync", value: "Active" }
        ]
      }
    },
    {
      id: "opportunities",
      tabTitle: "Opportunities & Pipeline",
      badge: "CRM & Deals",
      image: "/illustrations/landing-analytics.png",
      heading: "Visual Kanban deal pipeline and revenue forecasting.",
      description: "Manage deals across Discovery, Proposal, Negotiation, and Closed Won stages. Track deal values, assign reps, log activities, and forecast quarterly revenue.",
      features: [
        "Drag-and-drop Kanban pipeline and table views",
        "Win probability forecasting and deal health scores",
        "Complete activity timeline for emails, calls, and meetings"
      ],
      preview: {
        title: "Pipeline Overview",
        query: "Active Pipeline: $284,000\n• Discovery (6 deals · $62k)\n• Proposal Sent (4 deals · $98k)\n• In Negotiation (3 deals · $124k)",
        metrics: [
          { label: "Active Deals", value: "13" },
          { label: "Win Probability", value: "72%" },
          { label: "Forecast", value: "$284k" }
        ]
      }
    },
    {
      id: "segments",
      tabTitle: "Segments & Lead Forms",
      badge: "Audience & Inbound",
      image: "/illustrations/landing-outreach.png",
      heading: "Dynamic audience segmentation and embeddable capture forms.",
      description: "Filter contacts by custom tags, industries, or activity levels to build targeted segments. Create public capture forms that route incoming leads right into campaigns.",
      features: [
        "Visual rule-based audience segment builder",
        "Public embeddable lead capture forms with instant CRM sync",
        "Automated campaign enrollment for new form submissions"
      ],
      preview: {
        title: "Dynamic Segment",
        query: "Segment: 'SaaS Founders - US West'\n• Industry = Software\n• Revenue > $5M\n• Captured via: Web Form & Inbound Page\nAudience Size: 412 Contacts",
        metrics: [
          { label: "Segment Size", value: "412" },
          { label: "Sync Speed", value: "Real-time" },
          { label: "Capture Forms", value: "Unlimited" }
        ]
      }
    },
    {
      id: "meetings",
      tabTitle: "Meetings & Newsletters",
      badge: "Booking & Marketing",
      image: "/illustrations/landing-prospecting.png",
      heading: "Integrated booking links and rich newsletter builder.",
      description: "Share personalized booking links with automatic Google/Outlook Calendar and Zoom video sync. Create broadcast newsletters with a modern rich-text editor.",
      features: [
        "Personalized meeting booking links with availability rules",
        "Instant Zoom video meeting link generation",
        "Rich-text TipTap newsletter creator for customer broadcasts"
      ],
      preview: {
        title: "Scheduler & Newsletter",
        query: "Booking Page: nxelio.com/book/alex-demo\n• Google & Microsoft Calendar synced\n• Auto-generated Zoom meeting link\n• Newsletter: Monthly Product Update (Sent to 1,200 users)",
        metrics: [
          { label: "Calendar Sync", value: "2-Way" },
          { label: "Zoom Sync", value: "Auto" },
          { label: "Editor", value: "Rich WYSIWYG" }
        ]
      }
    }
  ];

  const current = capabilities[activeTab];

  return (
    <section id="capabilities" className="py-24 sm:py-32 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Core Modules
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight leading-tight">
            Explore every capability in Nxelio Nurture.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            A cohesive suite designed to take prospects from initial discovery all the way to closed revenue.
          </p>
        </div>

        <div className="max-w-4xl mx-auto mb-12 px-2">
          <div className="flex flex-wrap items-center justify-center gap-2 p-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl sm:rounded-full border border-white/80 dark:border-slate-700/60 shadow-lg">
            {capabilities.map((cap, i) => (
              <button
                key={cap.id}
                onClick={() => setActiveTab(i)}
                className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === i
                    ? "bg-[#1f2223] text-white dark:bg-blue-600 shadow-md scale-102"
                    : "text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800"
                }`}
              >
                {cap.tabTitle}
              </button>
            ))}
          </div>
        </div>

        <div className="landing-glass-card rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 md:p-14 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center shadow-2xl">
          
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
              <span>Try this feature free</span>
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
                Active Module
              </span>
            </div>

            <div className="mb-5 flex items-center justify-center h-44 bg-slate-50/70 rounded-2xl p-3 border border-slate-100 overflow-hidden">
              <img
                src={current.image}
                alt={current.heading}
                className="max-h-full max-w-full object-contain transition-all duration-300"
              />
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

function PlaybooksSection() {
  const plays = [
    {
      icon: "✉️",
      title: "Cold Email Outbound",
      desc: "A proven multi-step email sequence with personalized opening lines and deliverability-safe spacing.",
      tag: "4 steps · 10 days"
    },
    {
      icon: "🎯",
      title: "Verified Hiring Trigger",
      desc: "Reach out to executives at companies actively posting jobs in your target domain right when budgets open.",
      tag: "3 steps · 7 days"
    },
    {
      icon: "⚡",
      title: "Inbound Lead Follow-Up",
      desc: "Automatically respond to leads captured via web forms within minutes to maximize conversion.",
      tag: "3 steps · 5 days"
    },
    {
      icon: "💼",
      title: "Deal Re-Engagement",
      desc: "Warm up stalled opportunities with tailored check-ins and updated case study collateral.",
      tag: "3 steps · 8 days"
    },
    {
      icon: "🤝",
      title: "Meeting No-Show Rescheduler",
      desc: "Automatically send helpful rebooking links if a prospect misses a scheduled demo.",
      tag: "2 steps · 3 days"
    },
    {
      icon: "📰",
      title: "Monthly Product Newsletter",
      desc: "Send beautifully formatted customer updates using the built-in rich text newsletter builder.",
      tag: "Broadcast · Scheduled"
    }
  ];

  return (
    <section id="playbooks" className="py-24 sm:py-32 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Ready-To-Run Playbooks
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Launch pre-built campaigns in one click.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            Tested workflows for outbound prospecting, inbound lead capture, meeting scheduling, and newsletters.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plays.map((play, i) => (
            <div
              key={i}
              className="landing-glass-card rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover-lift-card text-left"
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
                <span>Use playbook</span>
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
    { name: "Email", category: "Gmail & Outlook", icon: "✉️" },
    { name: "LinkedIn", category: "Outreach", icon: "💼" },
    { name: "WhatsApp", category: "Outreach", icon: "💬" },
    { name: "Google Calendar", category: "Meeting Scheduling", icon: "📅" },
    { name: "Microsoft Calendar", category: "Meeting Scheduling", icon: "🗓️" },
    { name: "Zoom", category: "Video Meeting Links", icon: "🎥" },
    { name: "CSV Import", category: "Bring Your Own List", icon: "📄" }
  ];

  return (
    <section id="integrations" className="py-24 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 text-center">
        
        <div className="max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Native Integrations
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Connect seamlessly with the tools you rely on.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            Connect your email, LinkedIn, and WhatsApp for outreach, sync your calendar for automated booking, generate Zoom links, and import your existing CSV lists.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {tools.map((t, idx) => (
            <div
              key={idx}
              className="landing-glass-card rounded-2xl p-5 flex items-center gap-3.5 text-left shadow-md hover-lift-card"
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

function PricingSection() {
  const plans = [
    {
      name: "Basic",
      price: "$14.99",
      period: "/mo",
      annualNote: "or $143.90/yr — save 20%",
      trialNote: "7-day free trial · Credit card required",
      featured: false,
      features: [
        "400 AI credits / month",
        "Deal pipeline (Opportunities)",
        "CSV import & core workflows",
      ],
    },
    {
      name: "Starter",
      price: "$149.99",
      period: "/mo",
      annualNote: "or $1,439.90/yr — save 20%",
      trialNote: null,
      featured: true,
      features: [
        "1,400 AI credits / month",
        "1,000 AI-discovered leads / month",
        "LinkedIn outreach & contact enrichment",
        "Deal scoring & CRM export",
        "Everything in Basic",
      ],
    },
    {
      name: "Pro",
      price: "$299.99",
      period: "/mo",
      annualNote: "or $2,879.90/yr — save 20%",
      trialNote: null,
      featured: false,
      features: [
        "2,400 AI credits / month",
        "2,000 AI-discovered leads / month",
        "Reply tracking",
        "Meeting booking links & Zoom sync",
        "Priority support",
        "Everything in Starter",
      ],
    },
  ];

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Simple, Transparent Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Pick a plan. Start free for 7 days.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            A credit card is required to start your trial. Upgrade, downgrade, or cancel any time.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-3xl p-6 sm:p-8 flex flex-col transition-transform hover-lift-card ${
                plan.featured
                  ? "bg-[#1f2223] text-white shadow-2xl md:-translate-y-3 border border-white/20"
                  : "landing-glass-card shadow-lg"
              }`}
            >
              {plan.featured && (
                <span className="inline-flex self-start items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 bg-blue-500/20 text-blue-300">
                  Most Popular
                </span>
              )}
              <h3 className={`text-lg font-bold mb-1 ${plan.featured ? "text-white" : "text-[#1f2223]"}`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className={`text-4xl font-semibold tracking-tight ${plan.featured ? "text-white" : "text-[#1f2223]"}`}>
                  {plan.price}
                </span>
                <span className={plan.featured ? "text-slate-400" : "text-slate-500"}>{plan.period}</span>
              </div>
              <p className={`text-xs mb-6 ${plan.featured ? "text-slate-400" : "text-slate-500"}`}>
                {plan.annualNote}
              </p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      plan.featured ? "bg-blue-500/20 text-blue-300" : "bg-emerald-100 text-emerald-600"
                    }`}>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span className={plan.featured ? "text-slate-200" : "text-slate-700"}>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.trialNote && (
                <p className="text-xs text-slate-500 mb-3 text-center">{plan.trialNote}</p>
              )}

              <Link
                href="/signup"
                className={`inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
                  plan.featured
                    ? "bg-white text-[#1f2223] hover:bg-slate-100"
                    : "bg-[#1f2223] text-white hover:bg-black"
                }`}
              >
                <span>Start with {plan.name}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

function TrustSection() {
  // Styled like customer-quote cards (big quote mark, avatar row, dot
  // navigation, auto-rotating carousel) on purpose — but the "avatar" is an
  // icon and the "name" is a category, never a fake person. We have no real
  // customers to quote yet; faking one would be a false, deceptive statement
  // placed on a real site visitors act on.
  const points = [
    {
      Icon: Cpu,
      quote: "Prospecting, enrichment, and outreach copy are powered by OpenAI and Groq — not a scripted demo.",
      label: "Real AI",
      sub: "Not hype",
    },
    {
      Icon: ShieldCheck,
      quote: "Payments are processed by Stripe, the same infrastructure trusted by millions of businesses worldwide.",
      label: "Secure Billing",
      sub: "Powered by Stripe",
    },
    {
      Icon: Database,
      quote: "Authentication, storage, and database security are built on Supabase — audited, encrypted, industry-standard.",
      label: "Your Data",
      sub: "Protected by design",
    },
    {
      Icon: RefreshCw,
      quote: "Start with a 7-day free trial. A credit card is required to begin, but you can cancel, downgrade, or upgrade any time.",
      label: "No Lock-In",
      sub: "Cancel anytime",
    },
  ];

  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % points.length), 5000);
    return () => clearInterval(timer);
  }, [paused, points.length]);

  // 3-wide sliding window (matches a real multi-card carousel) that wraps
  // around, so it always shows `points.length` cards no matter which is active.
  const visible = [0, 1, 2].map((offset) => points[(current + offset) % points.length]);

  return (
    <section className="py-24 sm:py-28 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            Built To Be Trusted
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            Why teams trust Nxelio Nurture.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            We&apos;re an early-stage product without customer reviews yet — so here&apos;s what&apos;s actually true instead.
          </p>
        </div>

        <div
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-4xl mx-auto"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {visible.map((p) => (
            <div
              key={p.label}
              className="relative landing-glass-card rounded-2xl p-6 pt-8 flex flex-col shadow-lg transition-opacity duration-500 hover-lift-card"
            >
              <span className="absolute -top-4 left-6 w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-serif shadow-lg shadow-blue-600/30">
                &ldquo;
              </span>
              <p className="text-sm text-slate-700 leading-relaxed mb-6 flex-1">{p.quote}</p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <p.Icon className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1f2223]">{p.label}</div>
                  <div className="text-xs text-slate-500">{p.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-10">
          {points.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setCurrent(i)}
              className={`w-2.5 h-2.5 rounded-full transition-colors cursor-pointer ${
                i === current ? "bg-blue-600" : "bg-slate-200 hover:bg-slate-300"
              }`}
              aria-label={`Show ${p.label}`}
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
      q: "What is Nxelio?",
      a: "Nxelio is an all-in-one AI Sales and GTM platform. It combines prospect discovery, 15+ provider waterfall contact enrichment, cold email sequence campaigns, visual deal pipeline CRM, calendar meeting scheduling, and newsletter broadcasting into a single unified workspace."
    },
    {
      q: "How does contact enrichment work?",
      a: "Nxelio queries a waterfall of over 15 verified data providers to find deliverable business emails, direct phone numbers, and company firmographics. This multi-layer lookup ensures high accuracy and prevents emails from bouncing."
    },
    {
      q: "Can I bring my own contact list?",
      a: "Yes. You can import any CSV file with leads or accounts. Nxelio automatically maps your columns, enriches missing phone numbers or emails, and allows you to instantly enroll them into campaigns or segments."
    },
    {
      q: "How does the meeting booking feature work?",
      a: "Nxelio includes a built-in calendar scheduler. You can create public booking pages (e.g. nxelio.com/book/your-name), connect Google Calendar or Microsoft 365 to check real-time availability, and automatically create Zoom video meeting links."
    },
    {
      q: "How does the 7-day free trial work?",
      a: "You get full access to Nxelio for 7 days. You can discover prospects, run campaign sequences, test meeting bookings, and manage your pipeline risk-free. A credit card is required to start, and you can cancel anytime before you're charged."
    }
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-transparent">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <h2 className="text-3xl sm:text-4xl font-semibold text-center text-white tracking-tight mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div key={idx} className="landing-glass-card rounded-2xl overflow-hidden shadow-md">
              <button
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full px-6 py-5 flex items-center justify-between text-left text-[#1f2223] font-semibold text-base sm:text-lg hover:bg-white/40 transition-colors cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 text-slate-500 transition-transform shrink-0 ml-4 ${
                    openIdx === idx ? "rotate-180 text-slate-800" : ""
                  }`}
                />
              </button>
              {openIdx === idx && (
                <div className="px-6 pb-6 text-slate-700 text-sm sm:text-base leading-relaxed border-t border-slate-200/50">
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
        
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-8 mb-20 md:mb-28">
          <div>
            <p className="text-sm sm:text-lg text-slate-400 mb-3">
              Replace fragmented tools with one complete platform.
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
            Credit card required · Setup in under 2 minutes · Cancel anytime
          </p>
        </div>

        <hr className="h-px w-full border-0 bg-white/10 mb-14" />

        <footer className="w-full">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 text-left">
            
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
                  ⚡
                </div>
                <span className="text-lg font-bold tracking-tight text-white">Nxelio</span>
              </Link>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                All-in-one AI platform for lead discovery, waterfall enrichment, cold outreach sequences, CRM pipeline, and automated booking.
              </p>
              <div className="text-xs text-slate-500">
                &copy; {new Date().getFullYear()} Nxelio Inc. All rights reserved.
              </div>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Capabilities</p>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Prospects & Verified Jobs</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Waterfall Enrichment</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Campaigns & Sequences</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Opportunities & Pipeline</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Segments & Capture Forms</a>
              <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Meetings & Newsletters</a>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Playbooks</p>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Cold Email Outbound</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Verified Hiring Trigger</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Inbound Lead Follow-Up</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Deal Re-Engagement</a>
              <a href="#playbooks" className="text-slate-400 hover:text-white transition-colors">Product Newsletters</a>
            </div>

            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <p className="font-semibold text-white mb-1">Company</p>
              <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a>
              <a href="#faq" className="text-slate-400 hover:text-white transition-colors">FAQ</a>
              <Link href="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
              <Link href="/signup" className="text-slate-400 hover:text-white transition-colors">Get Started</Link>
              <Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="text-slate-400 hover:text-white transition-colors">Terms of Service</Link>
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
    <div className="landing-page min-h-screen font-sans selection:bg-blue-200 selection:text-blue-950 overflow-x-hidden text-[#1f2223] landing-page-mesh-bg">
      {notice && <PostSignupNotice notice={notice} />}
      <Navbar onBookDemo={() => setShowDemoModal(true)} />
      <Hero onBookDemo={() => setShowDemoModal(true)} />
      <CoreFeaturesGrid />
      <AITeamSection />
      <CapabilitiesSection />
      <PlaybooksSection />
      <IntegrationsSection />
      <PricingSection />
      <TestimonialsBentoSection />
      <TrustSection />
      <FAQSection />
      <DramaticBottomCTAAndFooter />

      <BookDemoModal open={showDemoModal} onClose={() => setShowDemoModal(false)} />
      <AiAssistantWidget />
    </div>
  );
}

