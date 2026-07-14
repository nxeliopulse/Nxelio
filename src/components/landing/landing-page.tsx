"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight, Check, Star, ChevronDown, Sparkles, Zap,
  Mail, BarChart3, Users, Inbox, Target, Globe,
  Menu, X, MessageSquare, TrendingUp, CheckCircle,
  Play, Layers, Megaphone, PieChart, Rss, Lock,
} from "lucide-react";
import { BookDemoModal } from "./book-demo-modal";
import { AiAssistantWidget } from "./ai-assistant-widget";

// ─── Infographic colour palette ───────────────────────────────────────────────
// Primary teal + 7 vivid accent hues — no dark backgrounds anywhere
const P = {
  teal:    { bg:"#E0F7FA", border:"#B2EBF2", icon:"#18A7B8", text:"#006064" },
  coral:   { bg:"#FFF0EE", border:"#FFCDD2", icon:"#F4511E", text:"#BF360C" },
  violet:  { bg:"#EDE7F6", border:"#D1C4E9", icon:"#7E57C2", text:"#4527A0" },
  amber:   { bg:"#FFF8E1", border:"#FFECB3", icon:"#FF9800", text:"#E65100" },
  blue:    { bg:"#E3F2FD", border:"#BBDEFB", icon:"#2196F3", text:"#0D47A1" },
  green:   { bg:"#E8F5E9", border:"#C8E6C9", icon:"#43A047", text:"#1B5E20" },
  pink:    { bg:"#FCE4EC", border:"#F8BBD0", icon:"#E91E63", text:"#880E4F" },
  orange:  { bg:"#FFF3E0", border:"#FFE0B2", icon:"#FF6F00", text:"#BF360C" },
};

// ─── Real features only ───────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Users,
    title: "Lead Management",
    desc: "Import leads via CSV or public capture form. View, filter, and manage your full prospect database in one place.",
    pal: P.teal,
    href: "/leads",
  },
  {
    icon: Mail,
    title: "Email Campaigns",
    desc: "Build and send outreach sequences to your leads with AI-written, personalised email copy.",
    pal: P.blue,
    href: "/campaigns",
  },
  {
    icon: Inbox,
    title: "Smart Inbox",
    desc: "All email replies land in a unified inbox. Quickly spot hot leads and follow up from one view.",
    pal: P.violet,
    href: "/inbox",
  },
  {
    icon: Target,
    title: "Opportunities",
    desc: "Track every deal through your pipeline — from first contact to closed won. Full kanban board.",
    pal: P.amber,
    href: "/opportunities",
  },
  {
    icon: Layers,
    title: "Segments",
    desc: "Group your leads into smart segments with AND/OR filter logic. Target the right people every time.",
    pal: P.coral,
    href: "/segments",
  },
  {
    icon: Rss,
    title: "Newsletters",
    desc: "Design and send beautiful newsletters to your contact lists. Track opens and clicks in real time.",
    pal: P.pink,
    href: "/newsletters",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    desc: "Campaign performance charts, open/click/reply rates, and lead engagement metrics at a glance.",
    pal: P.green,
    href: "/analytics",
  },
  {
    icon: Globe,
    title: "Capture Forms",
    desc: "Publish a branded capture form and collect new leads directly into your workspace automatically.",
    pal: P.orange,
    href: "/capture-form",
  },
];

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { n:"1", icon: Users,      title:"Import or Capture Leads",  desc:"Upload a CSV or share your public capture form link. New leads flow straight into your workspace.",         pal: P.teal   },
  { n:"2", icon: Mail,       title:"Run Email Campaigns",       desc:"Build a sequence, approve AI-drafted copy, and send personalised emails to your entire segment.",           pal: P.blue   },
  { n:"3", icon: Inbox,      title:"Manage Replies in Inbox",   desc:"All replies come to your Smart Inbox. Flag hot leads, reply, and keep every conversation in context.",     pal: P.violet },
  { n:"4", icon: TrendingUp, title:"Track Deals & Revenue",     desc:"Move qualified leads into Opportunities, advance them through your pipeline, and close revenue.",          pal: P.amber  },
];

// ─── Pricing ──────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name:"Basic",    price:"8.99", credits:150,  trial:"7-day free trial",
    color:"#18A7B8", bg:"#E0F7FA", border:"#B2EBF2", popular:false,
    features:["150 AI credits / month","CSV lead import","Email campaigns","Smart Inbox","Capture forms","7-day free trial — no card needed"],
  },
  {
    name:"Starter",  price:"59",   credits:1000, trial:null,
    color:"#7E57C2", bg:"#EDE7F6", border:"#7E57C2", popular:true,
    features:["1,000 AI credits / month","Everything in Basic","Opportunities pipeline","Segments & filtering","Newsletters","Analytics dashboard"],
  },
  {
    name:"Pro",      price:"139",  credits:2500, trial:null,
    color:"#F4511E", bg:"#FFF0EE", border:"#FFCDD2", popular:false,
    features:["2,500 AI credits / month","Everything in Starter","Priority support","Advanced analytics","Custom workflows","Dedicated onboarding"],
  },
];

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { quote:"Nxelio turned our outbound from a grind into a machine. Pipeline is up 3× in 90 days — the inbox alone saves my team hours every week.",        name:"Sarah Chen",       role:"Head of Sales",    co:"TechVenture", init:"SC", color:"#18A7B8" },
  { quote:"The capture form + campaigns combo is unbeatable. We published a form, ran a sequence, and had 40 replies in the first week. Zero tech setup.",  name:"Marcus Rodriguez", role:"Founder & CEO",   co:"GrowthLabs",  init:"MR", color:"#7E57C2" },
  { quote:"The Opportunities pipeline gives my team full visibility. We know exactly where every deal is and what to do next. Closed 18 deals last month.", name:"Priya Sharma",     role:"Revenue Director", co:"Enterprise.io", init:"PS", color:"#43A047" },
  { quote:"Segments + Newsletters changed our nurture game. We send the right message to the right people every time — open rates doubled.",               name:"Alex Kim",         role:"Marketing Lead",   co:"ScaleStack",  init:"AK", color:"#FF9800" },
];

// ─── FAQs ─────────────────────────────────────────────────────────────────────
const FAQS = [
  { q:"What is Nxelio?",                       a:"Nxelio is a B2B revenue platform. It lets you import leads, run email campaigns, manage replies in a unified inbox, track deals through an opportunities pipeline, segment your contacts, send newsletters, and view analytics — all from one workspace.", pal: P.teal   },
  { q:"How do AI credits work?",               a:"Each AI action (generating email copy, scoring a lead, enriching a contact) uses credits. Basic gives 150/month, Starter 1,000/month, Pro 2,500/month. Unused monthly credits reset at renewal.",                                                        pal: P.blue   },
  { q:"Does Basic include a free trial?",      a:"Yes — Basic includes a 7-day free trial with 150 AI credits. No credit card required at signup. You get full access to leads, campaigns, inbox, and capture forms.",                                                                                     pal: P.violet },
  { q:"How does the capture form work?",       a:"Go to Capture Form in settings, customise your form fields and branding, then publish. You get a public link (nxelio.ai/capture/your-slug) to share. Every submission lands directly in your Leads list.",                                              pal: P.amber  },
  { q:"Can I import my existing contacts?",    a:"Yes. Upload any CSV from Settings or Leads. Nxelio maps your columns automatically and imports every contact into your workspace instantly.",                                                                                                             pal: P.coral  },
  { q:"Is my data secure?",                    a:"Yes. Nxelio is built on Supabase with row-level security and workspace isolation. Your contacts, campaigns, and analytics are never shared across workspaces.",                                                                                          pal: P.green  },
  { q:"Can I cancel anytime?",                 a:"Yes. Cancel from your billing dashboard at any time — no cancellation fees. Your plan stays active until the end of the current billing period.",                                                                                                        pal: P.pink   },
];

// ─── Brand logos for marquee ───────────────────────────────────────────────────
const BRANDS = [
  "Acme Corp","TechVenture","GrowthLabs","ScaleStack",
  "Nexus AI","Orion SaaS","Apex Revenue","Prismatic",
  "Quantum CRM","Velocity GTM","PipeFlow","Outbound OS",
  "Acme Corp","TechVenture","GrowthLabs","ScaleStack",
  "Nexus AI","Orion SaaS","Apex Revenue","Prismatic",
];

// Brand colours for marquee dots
const BRAND_COLS = ["#18A7B8","#7E57C2","#F4511E","#FF9800","#2196F3","#43A047","#E91E63","#FF6F00"];

// ─── Typewriter hook ──────────────────────────────────────────────────────────
const WORDS = ["Revenue.", "More Deals.", "Real Pipeline.", "B2B Growth."];

function useTypewriter() {
  const [idx, setIdx]           = useState(0);
  const [text, setText]         = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const target = WORDS[idx];
    const speed  = deleting ? 45 : 85;
    const id = setTimeout(() => {
      if (!deleting) {
        if (text.length < target.length) setText(target.slice(0, text.length + 1));
        else setTimeout(() => setDeleting(true), 2000);
      } else {
        if (text.length > 0) setText(text.slice(0, -1));
        else { setDeleting(false); setIdx((i) => (i + 1) % WORDS.length); }
      }
    }, speed);
    return () => clearTimeout(id);
  }, [text, deleting, idx]);

  return text;
}

// ─── Scroll-reveal ────────────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".nxl-reveal,.nxl-reveal-left,.nxl-reveal-right,.nxl-reveal-scale");
    const io  = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("nxl-revealed"); }),
      { threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ─── Counter hook ─────────────────────────────────────────────────────────────
function useCounter(end: number, active: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const dur   = 1500;
    const tick  = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - t, 3)) * end));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, end]);
  return val;
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({ scrolled, mobileOpen, toggle, onBookDemo }: { scrolled: boolean; mobileOpen: boolean; toggle: () => void; onBookDemo: () => void }) {
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
      scrolled ? "bg-white/95 backdrop-blur-lg shadow-sm border-b border-slate-100" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={scrolled
              ? { background:"linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow:"0 4px 12px rgba(24,167,184,.3)" }
              : { background:"rgba(255,255,255,.2)", border:"1.5px solid rgba(255,255,255,.35)" }}>
            <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5">
              <path d="M7 24 L7 8 L19 22 L19 8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 15 L26 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
              <circle cx="26" cy="8" r="2.2" fill="white"/>
            </svg>
          </div>
          <span className={`font-bold text-lg tracking-tight transition-colors duration-300 ${scrolled ? "text-slate-900" : "text-white"}`}>
            Nx<span style={{ color: scrolled ? "#18A7B8" : "rgba(255,255,255,.9)" }}>elio</span>
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {[
            { label:"Features",    href:"#features" },
            { label:"How it works",href:"#how"      },
            { label:"Pricing",     href:"#pricing"  },
            { label:"Help",        href:"/help"     },
          ].map((l) => (
            <Link key={l.label} href={l.href}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                scrolled
                  ? "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  : "text-white/85 hover:text-white hover:bg-white/15"
              }`}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <Link href="/login"
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              scrolled ? "text-slate-600 hover:text-slate-900" : "text-white/85 hover:text-white"
            }`}>
            Sign In
          </Link>
          <button type="button" onClick={onBookDemo}
            className="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all hover:scale-[1.03] hover:shadow-xl"
            style={scrolled
              ? { background:"linear-gradient(135deg,#18A7B8,#7E57C2)", color:"white", boxShadow:"0 4px 16px rgba(24,167,184,.3)" }
              : { background:"white", color:"#18A7B8", boxShadow:"0 4px 20px rgba(0,0,0,.18)" }}>
            Book Demo <ArrowRight className="h-3.5 w-3.5"/>
          </button>
        </div>

        <button type="button" onClick={toggle}
          className={`lg:hidden p-2 rounded-lg transition-colors ${scrolled ? "text-slate-600 hover:bg-slate-100" : "text-white hover:bg-white/15"}`}>
          {mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-1">
          {[
            { label:"Features",   href:"#features" },
            { label:"How it works",href:"#how"     },
            { label:"Pricing",    href:"#pricing"  },
            { label:"Help",       href:"/help"     },
          ].map((l) => (
            <Link key={l.label} href={l.href} onClick={toggle}
              className="block px-3 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg">
              {l.label}
            </Link>
          ))}
          <div className="pt-3 flex flex-col gap-2 border-t border-slate-100 mt-3">
            <Link href="/login" className="block px-3 py-2.5 text-sm font-semibold text-center border border-slate-200 rounded-xl text-slate-700">Sign In</Link>
            <button type="button" onClick={() => { toggle(); onBookDemo(); }} className="block w-full px-3 py-2.5 text-sm font-bold text-center text-white rounded-xl"
              style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)" }}>Book Demo</button>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
function Hero({ onBookDemo }: { onBookDemo: () => void }) {
  const word = useTypewriter();
  return (
    <section className="relative overflow-hidden pt-24 pb-16" style={{ background:"#18A7B8" }}>
      {/* Subtle wave pattern overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{
        backgroundImage:"radial-gradient(circle at 15% 50%, white 0%, transparent 50%), radial-gradient(circle at 85% 20%, white 0%, transparent 40%)",
      }}/>
      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" style={{
        background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.08))",
      }}/>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8 nxl-section-in"
          style={{ background:"rgba(255,255,255,0.15)", borderColor:"rgba(255,255,255,0.3)" }}>
          <Sparkles className="h-3.5 w-3.5 text-white"/>
          <span className="text-xs font-bold text-white">B2B Revenue Platform — Everything in one workspace</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tight leading-[1.04] text-white max-w-4xl mx-auto nxl-section-in" style={{ animationDelay:"0.1s" }}>
          Turn Every Lead Into
        </h1>
        <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tight leading-[1.04] max-w-4xl mx-auto mt-1 mb-7 min-h-[1.15em] nxl-section-in" style={{ animationDelay:"0.15s", color:"rgba(255,255,255,0.9)" }}>
          {word}
          <span className="nxl-cursor" style={{ color:"white", marginLeft:"4px" }}>|</span>
        </h1>

        <p className="text-lg sm:text-xl max-w-2xl mx-auto font-medium leading-relaxed mb-10 nxl-section-in" style={{ animationDelay:"0.25s", color:"rgba(255,255,255,0.85)" }}>
          Nxelio puts your entire outreach workflow in one place — leads, campaigns,
          inbox, pipeline, segments, newsletters, and analytics.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12 nxl-section-in" style={{ animationDelay:"0.35s" }}>
          <button type="button" onClick={onBookDemo}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all hover:scale-[1.03] hover:shadow-2xl"
            style={{ background:"white", color:"#18A7B8", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            Book Demo <ArrowRight className="h-4 w-4"/>
          </button>
          <Link href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm text-white border transition-all hover:bg-white/10"
            style={{ borderColor:"rgba(255,255,255,0.4)" }}>
            <Play className="h-4 w-4"/> Sign In
          </Link>
        </div>

        {/* Trust row */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm nxl-section-in mb-14" style={{ animationDelay:"0.45s", color:"rgba(255,255,255,0.8)" }}>
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_,i)=><Star key={i} className="h-4 w-4 fill-amber-300 text-amber-300"/>)}
            <span className="ml-1 font-semibold text-white">4.9 / 5</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-white"/>
            <span className="font-semibold text-white">2,400+ revenue teams</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="h-4 w-4" style={{ color:"rgba(255,255,255,0.7)" }}/>
            <span>SOC 2-ready · Workspace-isolated data</span>
          </div>
        </div>

        {/* Feature pill grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto nxl-section-in" style={{ animationDelay:"0.55s" }}>
          {FEATURES.slice(0,8).map((f,i) => {
            const Icon = f.icon;
            return (
              <div key={f.title}
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl font-medium text-sm hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
                style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)", color:"white", backdropFilter:"blur(4px)" }}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"rgba(255,255,255,0.2)" }}>
                  <Icon className="h-4 w-4 text-white"/>
                </div>
                <span>{f.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── BRANDS MARQUEE ───────────────────────────────────────────────────────────
function BrandsSection() {
  return (
    <section className="py-14 overflow-hidden border-t border-b border-slate-100 bg-slate-50">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-8">
        Trusted by innovative revenue teams worldwide
      </p>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-50 to-transparent z-10 pointer-events-none"/>
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-50 to-transparent z-10 pointer-events-none"/>
        <div className="flex overflow-hidden">
          <div className="flex gap-6 nxl-marquee flex-shrink-0">
            {BRANDS.map((name, i) => (
              <div key={`${name}-${i}`} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-slate-200 shadow-sm flex-shrink-0 hover:shadow-md transition-shadow">
                <div className="h-4 w-4 rounded" style={{ background: BRAND_COLS[i % BRAND_COLS.length] + "33", border:`1px solid ${BRAND_COLS[i % BRAND_COLS.length]}44` }}>
                  <div className="h-full w-full rounded" style={{ background: BRAND_COLS[i % BRAND_COLS.length], opacity:0.6 }}/>
                </div>
                <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── STATS ────────────────────────────────────────────────────────────────────
const STAT_DATA = [
  { end:2400, suffix:"+", label:"Teams worldwide",   color:"#18A7B8" },
  { end:48,   suffix:"M+",label:"Revenue tracked",   color:"#7E57C2" },
  { end:94,   suffix:"%", label:"Lead score accuracy",color:"#43A047" },
  { end:7,    suffix:"×", label:"Avg pipeline growth",color:"#FF9800" },
];

function StatNum({ s, active }: { s: typeof STAT_DATA[0]; active: boolean }) {
  const v = useCounter(s.end, active);
  return (
    <div className="text-center p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow nxl-reveal">
      <p className="text-5xl font-black mb-1" style={{ color:s.color }}>
        {v.toLocaleString()}{s.suffix}
      </p>
      <p className="text-sm font-semibold text-slate-500">{s.label}</p>
    </div>
  );
}

function StatsSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setActive(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_DATA.map((s) => <StatNum key={s.label} s={s} active={active}/>)}
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES ─────────────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section id="features" className="py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
            style={{ background:"#E0F7FA", borderColor:"#B2EBF2" }}>
            <Zap className="h-3.5 w-3.5" style={{ color:"#18A7B8" }}/>
            <span className="text-xs font-bold" style={{ color:"#006064" }}>Everything you need in one workspace</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 max-w-3xl mx-auto leading-tight">
            8 powerful tools,{" "}
            <span className="nxl-text-shimmer">zero switching</span>
          </h2>
          <p className="mt-5 text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Every feature your team needs to find leads, run outreach, and close deals — built into a single platform.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={f.title}
                className={`group relative bg-white rounded-2xl overflow-hidden p-6 hover:-translate-y-2 transition-all duration-300 nxl-reveal-scale nxl-d${i + 1}`}
                style={{
                  border: `1.5px solid ${f.pal.border}`,
                  boxShadow: `0 2px 8px ${f.pal.icon}18`,
                  transitionTimingFunction: "cubic-bezier(.34,1.56,.64,1)",
                }}>

                {/* Top colour bar */}
                <div className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                  style={{ background: `linear-gradient(90deg, ${f.pal.icon}, ${f.pal.icon}99)` }}/>

                {/* Vivid gradient icon block */}
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300"
                  style={{ background: `linear-gradient(135deg, ${f.pal.icon}, ${f.pal.icon}cc)` }}>
                  <Icon className="h-7 w-7 text-white" strokeWidth={1.8}/>
                </div>

                <h3 className="text-base font-bold mb-2" style={{ color: f.pal.text }}>{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>

                {/* Hover: radial glow wash */}
                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(ellipse at 20% 20%, ${f.pal.icon}12 0%, transparent 65%)` }}/>

                {/* Hover shadow ring */}
                <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300"
                  style={{ boxShadow: `0 16px 40px ${f.pal.icon}30` }}/>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CRM DEMO VIDEOS ──────────────────────────────────────────────────────────
const CRM_DEMOS = [
  {
    title:   "Lead Management",
    desc:    "Import a CSV, search, filter, and score your prospect database in seconds.",
    dur:     "1:42",
    pal:     P.teal,
    icon:    Users,
    // Thumbnail mockup: table rows
    thumb: () => (
      <div className="w-full h-full flex flex-col p-4 gap-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded" style={{ background:"#18A7B8" }}/>
          <div className="h-2.5 w-20 rounded-full bg-white/60"/>
          <div className="ml-auto h-6 w-16 rounded-lg" style={{ background:"rgba(255,255,255,.25)" }}/>
        </div>
        {[90,70,80,65,75].map((w,i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 rounded-lg px-2" style={{ background:i===0?"rgba(255,255,255,.18)":"transparent" }}>
            <div className="h-6 w-6 rounded-full flex-shrink-0" style={{ background:`rgba(255,255,255,${0.15+i*0.04})` }}/>
            <div className="flex-1 flex gap-2">
              <div className="h-2 rounded-full" style={{ width:`${w}%`, background:"rgba(255,255,255,.5)" }}/>
              <div className="h-2 w-12 rounded-full" style={{ background:"rgba(255,255,255,.25)" }}/>
            </div>
            <div className="h-4 w-10 rounded-full text-[8px] font-bold flex items-center justify-center" style={{ background:"rgba(255,255,255,.25)", color:"white" }}>Hot</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title:   "Email Campaigns",
    desc:    "Build a multi-step sequence, approve AI copy, and launch to a segment.",
    dur:     "2:05",
    pal:     P.blue,
    icon:    Mail,
    thumb: () => (
      <div className="w-full h-full flex flex-col p-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded" style={{ background:"#2196F3" }}/>
          <div className="h-2.5 w-24 rounded-full bg-white/60"/>
        </div>
        {/* Timeline steps */}
        <div className="flex-1 flex gap-2 items-stretch">
          <div className="flex flex-col items-center gap-0">
            {[1,2,3].map((n) => (
              <div key={n} className="flex flex-col items-center">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background:"rgba(255,255,255,.35)" }}>{n}</div>
                {n<3 && <div className="w-0.5 h-5" style={{ background:"rgba(255,255,255,.2)" }}/>}
              </div>
            ))}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            {["Welcome email","Follow-up #1","Closing offer"].map((s,i) => (
              <div key={s} className="flex-1 rounded-lg px-3 flex items-center" style={{ background:"rgba(255,255,255,.15)" }}>
                <div className="flex flex-col gap-1">
                  <div className="h-2 rounded-full" style={{ width:`${70-i*10}%`, background:"rgba(255,255,255,.7)" }}/>
                  <div className="h-1.5 w-12 rounded-full" style={{ background:"rgba(255,255,255,.35)" }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ background:"rgba(255,255,255,.3)" }}>Launch Campaign →</div>
      </div>
    ),
  },
  {
    title:   "Smart Inbox",
    desc:    "See every reply in one place, flag hot leads, and reply without leaving Nxelio.",
    dur:     "1:18",
    pal:     P.violet,
    icon:    Inbox,
    thumb: () => (
      <div className="w-full h-full flex p-3 gap-3">
        {/* Thread list */}
        <div className="w-2/5 flex flex-col gap-1.5">
          {[
            { init:"SC", dot:"#FF6B6B", read:false },
            { init:"MR", dot:"#18A7B8", read:true  },
            { init:"AK", dot:"#FFD93D", read:false },
            { init:"PS", dot:"#6BCB77", read:true  },
          ].map((t,i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background:i===0?"rgba(255,255,255,.22)":"rgba(255,255,255,.08)" }}>
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background:"rgba(255,255,255,.3)" }}>{t.init}</div>
              <div className="flex-1 min-w-0">
                <div className="h-2 rounded-full mb-1" style={{ width:"70%", background:"rgba(255,255,255,.7)" }}/>
                <div className="h-1.5 rounded-full" style={{ width:"50%", background:"rgba(255,255,255,.3)" }}/>
              </div>
              {!t.read && <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background:t.dot }}/>}
            </div>
          ))}
        </div>
        {/* Email view */}
        <div className="flex-1 rounded-xl p-3 flex flex-col gap-2" style={{ background:"rgba(255,255,255,.12)" }}>
          <div className="h-2.5 w-20 rounded-full" style={{ background:"rgba(255,255,255,.7)" }}/>
          <div className="h-1.5 w-32 rounded-full" style={{ background:"rgba(255,255,255,.35)" }}/>
          <div className="flex-1 flex flex-col gap-1.5 mt-1">
            {[90,75,60,80].map((w,i)=>(
              <div key={i} className="h-1.5 rounded-full" style={{ width:`${w}%`, background:"rgba(255,255,255,.25)" }}/>
            ))}
          </div>
          <div className="h-7 rounded-lg mt-auto" style={{ background:"rgba(255,255,255,.25)" }}/>
        </div>
      </div>
    ),
  },
  {
    title:   "Opportunities Pipeline",
    desc:    "Drag deals across kanban columns and track every stage to closed won.",
    dur:     "1:55",
    pal:     P.amber,
    icon:    Target,
    thumb: () => (
      <div className="w-full h-full flex flex-col p-4 gap-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded" style={{ background:"#FF9800" }}/>
          <div className="h-2.5 w-28 rounded-full bg-white/60"/>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          {[
            { label:"Prospecting", cards:[75,55] },
            { label:"Qualified",   cards:[80,60,45] },
            { label:"Closed Won",  cards:[70] },
          ].map((col) => (
            <div key={col.label} className="flex flex-col gap-2">
              <div className="h-1.5 rounded-full" style={{ width:"70%", background:"rgba(255,255,255,.5)" }}/>
              {col.cards.map((w,i) => (
                <div key={i} className="rounded-lg p-2 flex flex-col gap-1" style={{ background:"rgba(255,255,255,.18)" }}>
                  <div className="h-1.5 rounded-full" style={{ width:`${w}%`, background:"rgba(255,255,255,.7)" }}/>
                  <div className="h-1 w-10 rounded-full" style={{ background:"rgba(255,255,255,.35)" }}/>
                  <div className="h-3 w-12 rounded-full text-[7px] font-bold flex items-center justify-center mt-1" style={{ background:"rgba(255,255,255,.3)", color:"white" }}>$12k</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title:   "Newsletters",
    desc:    "Design a branded newsletter and send it to your entire contact list in minutes.",
    dur:     "1:30",
    pal:     P.pink,
    icon:    Rss,
    thumb: () => (
      <div className="w-full h-full flex flex-col p-4 gap-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded" style={{ background:"#E91E63" }}/>
          <div className="h-2.5 w-20 rounded-full bg-white/60"/>
        </div>
        {/* Email preview */}
        <div className="flex-1 rounded-xl p-3 flex flex-col gap-2" style={{ background:"rgba(255,255,255,.15)" }}>
          <div className="h-10 rounded-lg" style={{ background:"rgba(255,255,255,.3)" }}/>
          <div className="h-2 rounded-full w-3/4 mx-auto" style={{ background:"rgba(255,255,255,.6)" }}/>
          <div className="h-1.5 rounded-full w-1/2 mx-auto" style={{ background:"rgba(255,255,255,.35)" }}/>
          <div className="flex gap-2 mt-1">
            {[0,1].map(i=>(
              <div key={i} className="flex-1 rounded-lg p-2" style={{ background:"rgba(255,255,255,.18)" }}>
                <div className="h-8 rounded mb-1" style={{ background:"rgba(255,255,255,.25)" }}/>
                <div className="h-1.5 rounded-full w-full" style={{ background:"rgba(255,255,255,.4)" }}/>
                <div className="h-1.5 rounded-full w-3/4 mt-1" style={{ background:"rgba(255,255,255,.25)" }}/>
              </div>
            ))}
          </div>
          <div className="h-6 rounded-lg mx-auto w-24" style={{ background:"rgba(255,255,255,.35)" }}/>
        </div>
        <div className="h-6 rounded-lg flex items-center justify-center text-[9px] font-bold text-white" style={{ background:"rgba(255,255,255,.3)" }}>Send to 1,200 subscribers</div>
      </div>
    ),
  },
  {
    title:   "Analytics Dashboard",
    desc:    "Track open rates, reply rates, and pipeline performance across all campaigns.",
    dur:     "1:48",
    pal:     P.green,
    icon:    BarChart3,
    thumb: () => (
      <div className="w-full h-full flex flex-col p-4 gap-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded" style={{ background:"#43A047" }}/>
          <div className="h-2.5 w-20 rounded-full bg-white/60"/>
        </div>
        {/* Mini stat row */}
        <div className="grid grid-cols-3 gap-2">
          {[["48%","Open rate"],["12%","Reply rate"],["$92k","Revenue"]].map(([n,l]) => (
            <div key={l} className="rounded-lg p-2 text-center" style={{ background:"rgba(255,255,255,.18)" }}>
              <div className="text-sm font-black text-white">{n}</div>
              <div className="text-[8px] text-white/60">{l}</div>
            </div>
          ))}
        </div>
        {/* Bar chart */}
        <div className="flex-1 flex items-end gap-1.5">
          {[55,80,40,95,65,70,85,50].map((h,i) => (
            <div key={i} className="flex-1 rounded-t-lg" style={{ height:`${h}%`, background:`rgba(255,255,255,${0.2+i*0.04})` }}/>
          ))}
        </div>
        <div className="flex gap-1.5">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun","Mon"].map((d,i)=>(
            <div key={i} className="flex-1 text-center text-[7px] text-white/40">{d.slice(0,2)}</div>
          ))}
        </div>
      </div>
    ),
  },
];

function CRMDemos() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      <section className="py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-14 nxl-reveal">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
              style={{ background:"#FCE4EC", borderColor:"#F8BBD0" }}>
              <Play className="h-3.5 w-3.5" style={{ color:"#E91E63" }}/>
              <span className="text-xs font-bold" style={{ color:"#880E4F" }}>Feature walkthroughs</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-tight max-w-2xl mx-auto">
              Watch every feature{" "}
              <span className="nxl-text-shimmer">in 2 minutes</span>
            </h2>
            <p className="mt-5 text-lg text-slate-500 font-medium max-w-xl mx-auto">
              Short, focused demos for each part of the platform — no fluff, just the workflow.
            </p>
          </div>

          {/* Video grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CRM_DEMOS.map((demo, i) => {
              const Icon = demo.icon;
              const Thumb = demo.thumb;
              return (
                <div
                  key={demo.title}
                  onClick={() => setActive(i)}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-2 nxl-reveal nxl-d${(i % 6) + 1}`}
                  style={{
                    boxShadow: `0 4px 20px ${demo.pal.icon}22`,
                    border: `1.5px solid ${demo.pal.border}`,
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative h-48 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${demo.pal.icon}, ${demo.pal.icon}bb)` }}
                  >
                    <Thumb />

                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                      style={{ background: "rgba(0,0,0,0)" }}>
                      <div
                        className="flex items-center justify-center rounded-full shadow-xl transition-all duration-300 opacity-85 group-hover:opacity-100 group-hover:scale-110"
                        style={{ height:"52px", width:"52px", background:"white", boxShadow:`0 4px 20px rgba(0,0,0,.25)` }}>
                        <div className="flex items-center justify-center rounded-full"
                          style={{ height:"38px", width:"38px", background:`linear-gradient(135deg, ${demo.pal.icon}, ${demo.pal.icon}cc)` }}>
                          <Play className="h-4 w-4 text-white" style={{ marginLeft:"2px" }}/>
                        </div>
                      </div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                      style={{ background: "rgba(0,0,0,.45)", backdropFilter:"blur(4px)" }}>
                      {demo.dur}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="bg-white p-5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="h-8 w-8 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{ background: demo.pal.bg }}>
                        <Icon className="h-4 w-4" style={{ color: demo.pal.icon }}/>
                      </div>
                      <h3 className="text-sm font-bold" style={{ color: demo.pal.text }}>{demo.title}</h3>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{demo.desc}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-bold transition-colors"
                      style={{ color: demo.pal.icon }}>
                      Watch demo <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1"/>
                    </div>
                  </div>

                  {/* Hover border glow */}
                  <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ boxShadow: `inset 0 0 0 2px ${demo.pal.icon}` }}/>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modal */}
      {active !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: "rgba(10,15,25,.85)", backdropFilter: "blur(8px)" }}
          onClick={() => setActive(null)}
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#0D1627" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
              <div className="flex items-center gap-2.5">
                <div
                  className="h-7 w-7 rounded-lg flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${CRM_DEMOS[active].pal.icon}, ${CRM_DEMOS[active].pal.icon}99)` }}>
                  {(() => { const Icon = CRM_DEMOS[active].icon; return <Icon className="h-4 w-4 text-white"/>; })()}
                </div>
                <span className="text-sm font-bold text-white">{CRM_DEMOS[active].title} — Demo</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white/70"
                  style={{ background:"rgba(255,255,255,.08)" }}>
                  {CRM_DEMOS[active].dur}
                </div>
                <button type="button" onClick={() => setActive(null)}
                  className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                  <X className="h-4 w-4 text-white/70"/>
                </button>
              </div>
            </div>

            {/* Video area */}
            <div className="relative" style={{ paddingBottom: "56.25%" }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                style={{ background: `linear-gradient(135deg, ${CRM_DEMOS[active].pal.icon}33, #0D1627)` }}>
                <div
                  className="flex items-center justify-center rounded-full shadow-2xl"
                  style={{ height:"72px", width:"72px", background:`linear-gradient(135deg,${CRM_DEMOS[active].pal.icon},${CRM_DEMOS[active].pal.icon}aa)`, boxShadow:`0 8px 40px ${CRM_DEMOS[active].pal.icon}60` }}>
                  <Play className="h-7 w-7 text-white" style={{ marginLeft:"3px" }}/>
                </div>
                <p className="text-white/60 text-sm font-medium">
                  Add your {CRM_DEMOS[active].title} demo video URL here
                </p>
                <p className="text-white/30 text-xs">Swap placeholder div for a YouTube / Loom iframe</p>
              </div>
              {/*
                Replace div above with a real embed, e.g.:
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID?autoplay=1"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              */}
            </div>

            {/* Nav: prev / next */}
            <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor:"rgba(255,255,255,.08)" }}>
              <button type="button"
                onClick={() => setActive((p) => (p! - 1 + CRM_DEMOS.length) % CRM_DEMOS.length)}
                className="flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/08">
                ← Previous
              </button>
              <div className="flex items-center gap-1.5">
                {CRM_DEMOS.map((_, i) => (
                  <button key={i} type="button" onClick={() => setActive(i)}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: active === i ? "20px" : "6px", background: active === i ? CRM_DEMOS[active].pal.icon : "rgba(255,255,255,.2)" }}/>
                ))}
              </div>
              <button type="button"
                onClick={() => setActive((p) => (p! + 1) % CRM_DEMOS.length)}
                className="flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/08">
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how" className="py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
            style={{ background:"#EDE7F6", borderColor:"#D1C4E9" }}>
            <MessageSquare className="h-3.5 w-3.5" style={{ color:"#7E57C2" }}/>
            <span className="text-xs font-bold" style={{ color:"#4527A0" }}>Get started in minutes</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-tight">
            From zero to{" "}
            <span className="nxl-text-shimmer">closed deals</span>
            {" "}in 4 steps
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className={`relative nxl-reveal-scale nxl-d${i + 1}`}>
                {/* Arrow connector between cards */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:flex absolute top-12 left-full z-10 items-center -translate-x-1/2">
                    <div className="h-0.5 w-5" style={{ background:`linear-gradient(to right,${s.pal.icon},${STEPS[i+1].pal.icon})` }}/>
                    <svg width="8" height="10" viewBox="0 0 8 10" fill="none" style={{ flexShrink:0 }}>
                      <path d="M1 1L7 5L1 9" stroke={STEPS[i+1].pal.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}

                <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 h-full"
                  style={{ border:`1.5px solid ${s.pal.border}` }}>

                  {/* Vivid gradient top */}
                  <div className="relative px-6 pt-6 pb-5 flex items-start justify-between"
                    style={{ background:`linear-gradient(135deg, ${s.pal.icon}, ${s.pal.icon}cc)` }}>

                    {/* Big step number watermark */}
                    <span className="absolute right-4 top-2 text-7xl font-black leading-none select-none pointer-events-none"
                      style={{ color:"rgba(255,255,255,.15)", lineHeight:1 }}>{s.n}</span>

                    {/* Icon */}
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background:"rgba(255,255,255,.22)", backdropFilter:"blur(4px)" }}>
                      <Icon className="h-7 w-7 text-white" strokeWidth={1.8}/>
                    </div>

                    {/* Step badge */}
                    <span className="mt-1 text-xs font-bold px-2.5 py-1 rounded-full text-white"
                      style={{ background:"rgba(255,255,255,.25)" }}>
                      Step {s.n}
                    </span>
                  </div>

                  {/* White body */}
                  <div className="bg-white px-6 py-5">
                    <h3 className="text-base font-bold mb-2" style={{ color: s.pal.text }}>{s.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>

                    {/* Bottom colour bar */}
                    <div className="mt-5 h-1 rounded-full"
                      style={{ background:`linear-gradient(to right,${s.pal.icon},${s.pal.icon}44)` }}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── PRICING ──────────────────────────────────────────────────────────────────
function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-28 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
            style={{ background:"#FFF8E1", borderColor:"#FFECB3" }}>
            <Sparkles className="h-3 w-3" style={{ color:"#FF9800" }}/>
            <span className="text-xs font-bold" style={{ color:"#E65100" }}>Simple, honest pricing</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-tight max-w-2xl mx-auto">
            Pick your plan,{" "}
            <span className="nxl-text-shimmer">grow revenue</span>
          </h2>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-semibold ${!annual?"text-slate-900":"text-slate-400"}`}>Monthly</span>
            <button type="button" onClick={() => setAnnual((v)=>!v)}
              className="relative rounded-full transition-colors duration-300 flex-shrink-0"
              style={{ height:"28px", width:"52px", background:annual?"#18A7B8":"#e2e8f0" }}>
              <span className="absolute top-[3px] rounded-full bg-white shadow-md transition-all duration-300"
                style={{ height:"22px", width:"22px", left: annual ? "27px" : "3px" }}/>
            </button>
            <span className={`text-sm font-semibold ${annual?"text-slate-900":"text-slate-400"}`}>Annual</span>
            {annual && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                style={{ background:"#E8F5E9", color:"#1B5E20" }}>Save 20%</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {PLANS.map((plan) => {
            const price = annual
              ? (Number(plan.price) * 0.8).toFixed(Number(plan.price) < 10 ? 2 : 0)
              : plan.price;

            return (
              <div key={plan.name}
                className={`relative bg-white rounded-3xl border flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl overflow-hidden ${plan.popular ? "scale-[1.03] shadow-xl" : "shadow-sm border-slate-200"}`}
                style={{ borderColor:plan.popular ? plan.color : undefined, borderWidth:plan.popular ? "2px" : undefined }}>

                {plan.popular && (
                  <div className="w-full py-2 text-center text-xs font-bold text-white tracking-wide"
                    style={{ background:"linear-gradient(135deg,#FF9800,#F4511E)" }}>
                    ⚡ Most Popular
                  </div>
                )}

                <div className="p-7 flex flex-col flex-1">
                {/* Header */}
                <div className="mb-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4"
                    style={{ background:plan.bg, color:plan.color }}>
                    {plan.name}
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-black text-slate-900">${price}</span>
                    <span className="text-sm text-slate-400">/mo</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color:plan.color }}>
                    <Zap className="h-3 w-3"/> {plan.credits.toLocaleString()} AI credits / month
                  </div>
                  {plan.trial && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                      style={{ background:plan.bg, color:plan.color }}>
                      <CheckCircle className="h-3 w-3"/> {plan.trial}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color:plan.color }}/>
                      <span className="text-slate-600">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/signup"
                  className="block w-full text-center px-5 py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02]"
                  style={plan.popular
                    ? { background:`linear-gradient(135deg,${plan.color},#F4511E)`, color:"white", boxShadow:`0 8px 24px ${plan.color}40` }
                    : { background:plan.bg, color:plan.color, border:`1.5px solid ${plan.border}` }}>
                  {plan.trial ? "Start Free Trial →" : "Get Started →"}
                </Link>
                </div>{/* end inner p-7 wrapper */}
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-slate-400 mt-8">
          Need more credits? Buy one-time top-up packs from your billing dashboard anytime.
        </p>
      </div>
    </section>
  );
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
function Testimonials() {
  return (
    <section id="testimonials" className="py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
            style={{ background:"#FCE4EC", borderColor:"#F8BBD0" }}>
            <Star className="h-3 w-3 fill-current" style={{ color:"#E91E63" }}/>
            <span className="text-xs font-bold" style={{ color:"#880E4F" }}>Customer stories</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-tight max-w-2xl mx-auto">
            Teams that{" "}<span className="nxl-text-shimmer">love Nxelio</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TESTIMONIALS.map((t) => (
            <div key={t.name}
              className="bg-white rounded-2xl border border-slate-100 p-7 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 nxl-reveal">
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_,i)=><Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400"/>)}
              </div>
              <p className="text-slate-600 text-base leading-relaxed italic mb-6">&quot;{t.quote}&quot;</p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background:t.color }}>
                  {t.init}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.role} · {t.co}</p>
                </div>
              </div>
              {/* Bottom colour accent */}
              <div className="mt-5 h-1 rounded-full" style={{ background:`linear-gradient(to right, ${t.color}40, ${t.color}10)` }}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState<number|null>(null);
  return (
    <section className="py-28 bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
            style={{ background:"#E0F7FA", borderColor:"#B2EBF2" }}>
            <MessageSquare className="h-3.5 w-3.5" style={{ color:"#18A7B8" }}/>
            <span className="text-xs font-bold" style={{ color:"#006064" }}>Got questions?</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
            Frequently asked{" "}<span className="nxl-text-shimmer">questions</span>
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            const { pal } = faq;
            return (
              <div key={i}
                className={`rounded-2xl overflow-hidden transition-all duration-300 nxl-reveal nxl-d${(i % 4) + 1}`}
                style={{
                  border: `1.5px solid ${isOpen ? pal.icon : pal.border}`,
                  background: isOpen ? pal.bg : "white",
                  boxShadow: isOpen ? `0 4px 20px ${pal.icon}18` : "0 1px 3px rgba(0,0,0,.04)",
                }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center gap-4 p-5 text-left">

                  {/* Coloured number badge */}
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 transition-all duration-300"
                    style={{
                      background: isOpen ? pal.icon : pal.bg,
                      color:      isOpen ? "white"  : pal.icon,
                      border:     `1.5px solid ${pal.border}`,
                    }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  <span className="flex-1 text-sm font-bold transition-colors duration-200"
                    style={{ color: isOpen ? pal.text : "#1e293b" }}>
                    {faq.q}
                  </span>

                  {/* Chevron */}
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      background: isOpen ? pal.icon : pal.bg,
                      border:     `1.5px solid ${isOpen ? pal.icon : pal.border}`,
                      transform:  isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}>
                    <ChevronDown className="h-4 w-4" style={{ color: isOpen ? "white" : pal.icon }}/>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pl-[68px]">
                    {/* Coloured left rule */}
                    <div className="relative pl-4 border-l-2" style={{ borderColor: pal.icon }}>
                      <p className="text-sm leading-relaxed" style={{ color: pal.text }}>{faq.a}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CTA BANNER ───────────────────────────────────────────────────────────────
function CTABanner({ onBookDemo }: { onBookDemo: () => void }) {
  return (
    <section className="py-8 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl p-12 sm:p-20 text-center"
          style={{ background:"linear-gradient(135deg,#E0F7FA 0%,#EDE7F6 50%,#E0F7FA 100%)" }}>
          {/* Colour blobs */}
          <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-60 nxl-blob"
            style={{ background:"radial-gradient(circle,#18A7B8 0%,transparent 70%)", filter:"blur(40px)" }}/>
          <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-40 nxl-blob-slow"
            style={{ background:"radial-gradient(circle,#7E57C2 0%,transparent 70%)", filter:"blur(40px)" }}/>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full opacity-20 nxl-blob-fast"
            style={{ background:"radial-gradient(circle,#F4511E 0%,transparent 70%)", filter:"blur(60px)" }}/>

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
              style={{ background:"white", borderColor:"#B2EBF2" }}>
              <Sparkles className="h-3 w-3" style={{ color:"#18A7B8" }}/>
              <span className="text-xs font-bold" style={{ color:"#006064" }}>Ready in under 60 seconds</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-black text-slate-900 leading-tight tracking-tight max-w-3xl mx-auto">
              Stop juggling tools.
              <span className="block mt-1 nxl-text-shimmer">Start closing deals.</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600 max-w-xl mx-auto font-medium leading-relaxed">
              Join 2,400+ revenue teams using Nxelio to run their entire outreach workflow
              from a single, beautifully simple workspace.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button type="button" onClick={onBookDemo}
                className="inline-flex items-center gap-2 px-9 py-4 rounded-xl font-bold text-white text-base transition-all hover:scale-[1.03] hover:shadow-xl"
                style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow:"0 12px 40px rgba(24,167,184,.35)", padding:"1rem 2.25rem" }}>
                Book Demo — No card needed <ArrowRight className="h-4 w-4"/>
              </button>
              <Link href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-slate-700 text-sm bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
                <Play className="h-4 w-4" style={{ color:"#18A7B8" }}/> Sign In
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-400">Basic plan · 7-day free trial · 150 AI credits · Cancel anytime</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function Footer() {
  const NAV = [
    {
      heading: "Product",
      links: [
        { l:"Leads",         h:"/leads"         },
        { l:"Campaigns",     h:"/campaigns"     },
        { l:"Inbox",         h:"/inbox"         },
        { l:"Opportunities", h:"/opportunities" },
        { l:"Segments",      h:"/segments"      },
      ],
    },
    {
      heading: "More",
      links: [
        { l:"Newsletters",  h:"/newsletters"  },
        { l:"Analytics",    h:"/analytics"    },
        { l:"Capture Forms",h:"/capture-form" },
        { l:"Pricing",      h:"#pricing"      },
        { l:"Help",         h:"/help"         },
      ],
    },
    {
      heading: "Legal",
      links: [
        { l:"Privacy", h:"/privacy" },
        { l:"Terms",   h:"/terms"   },
        { l:"Sign up", h:"/signup"  },
        { l:"Log in",  h:"/login"   },
      ],
    },
  ];

  return (
    <footer className="relative overflow-hidden" style={{ background:"#18A7B8" }}>
      {/* Subtle background glow blobs */}
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%)" }}/>
      <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(126,87,194,.25) 0%,transparent 70%)" }}/>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">

        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">

          {/* Brand col */}
          <div className="col-span-2">
            {/* Glass logo card */}
            <div className="inline-flex items-center gap-2.5 mb-5 px-4 py-3 rounded-2xl"
              style={{ background:"rgba(255,255,255,.15)", border:"1.5px solid rgba(255,255,255,.25)", backdropFilter:"blur(8px)" }}>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background:"rgba(255,255,255,.2)", border:"1.5px solid rgba(255,255,255,.35)" }}>
                <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5">
                  <path d="M7 24 L7 8 L19 22 L19 8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 15 L26 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
                  <circle cx="26" cy="8" r="2.2" fill="white"/>
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-lg leading-none">Nxelio</p>
                <p className="text-[10px] text-white/60 uppercase tracking-[0.14em] mt-0.5">Turn Leads into Revenue</p>
              </div>
            </div>

            <p className="text-sm text-white/75 max-w-xs leading-relaxed mb-6">
              The all-in-one B2B revenue platform — leads, campaigns, inbox, pipeline, and analytics in one workspace.
            </p>

            {/* Social / trust pills */}
            <div className="flex flex-wrap gap-2">
              {["SOC 2-ready","GDPR","Workspace-isolated"].map((t) => (
                <span key={t} className="text-[10px] font-bold px-3 py-1 rounded-full"
                  style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", color:"rgba(255,255,255,.85)" }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {NAV.map((col) => (
            <div key={col.heading}
              className="p-5 rounded-2xl"
              style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.18)", backdropFilter:"blur(6px)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-4">{col.heading}</p>
              <ul className="space-y-2.5">
                {col.links.map((lk) => (
                  <li key={lk.l}>
                    <Link href={lk.h}
                      className="text-sm font-medium text-white/70 hover:text-white transition-colors duration-200 flex items-center gap-1.5 group">
                      <span className="h-1 w-1 rounded-full bg-white/30 group-hover:bg-white/80 transition-colors flex-shrink-0"/>
                      {lk.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop:"1px solid rgba(255,255,255,.18)" }}>
          <p className="text-xs text-white/55">© 2026 Nxelio, Inc. All rights reserved.</p>
          <div className="flex items-center gap-2 text-xs text-white/55">
            <Lock className="h-3.5 w-3.5 text-white/70"/>
            <span>Secured by Supabase · Row-level security</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="text-xs text-white/55 hover:text-white transition-colors">Privacy</Link>
            <span className="text-white/25">·</span>
            <Link href="/terms"   className="text-xs text-white/55 hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── DEMO VIDEO ───────────────────────────────────────────────────────────────
function DemoVideo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 nxl-section-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-5"
              style={{ background:"#EDE7F6", borderColor:"#D1C4E9" }}>
              <Play className="h-3.5 w-3.5" style={{ color:"#7E57C2" }}/>
              <span className="text-xs font-bold" style={{ color:"#4527A0" }}>2-minute product tour</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
              See Nxelio in{" "}
              <span className="nxl-text-shimmer">action</span>
            </h2>
            <p className="mt-4 text-base text-slate-500 font-medium max-w-lg mx-auto">
              Watch how teams go from lead import to closed deal — all inside one workspace.
            </p>
          </div>

          {/* Video panel */}
          <div
            className="relative rounded-3xl overflow-hidden cursor-pointer group nxl-reveal-scale"
            onClick={() => setOpen(true)}
            style={{
              boxShadow: "0 32px 80px rgba(24,167,184,.18), 0 8px 24px rgba(0,0,0,.10)",
              border: "1.5px solid #B2EBF2",
            }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background:"#F8FAFB", borderColor:"#E2E8F0" }}>
              <span className="h-3 w-3 rounded-full inline-block" style={{ background:"#FF5F57" }}/>
              <span className="h-3 w-3 rounded-full inline-block" style={{ background:"#FEBC2E" }}/>
              <span className="h-3 w-3 rounded-full inline-block" style={{ background:"#28C840" }}/>
              <div className="ml-3 flex-1 max-w-xs mx-auto h-5 rounded-full flex items-center px-3 gap-2 border"
                style={{ background:"#FFFFFF", borderColor:"#E2E8F0" }}>
                <Lock className="h-2.5 w-2.5 text-slate-400"/>
                <span className="text-[10px] text-slate-400 font-medium">app.nxelio.ai/dashboard</span>
              </div>
            </div>

            {/* App mockup */}
            <div className="relative" style={{ background:"#F1F5F9", minHeight:"420px" }}>
              {/* Sidebar */}
              <div className="absolute top-0 left-0 bottom-0 w-48 border-r" style={{ background:"white", borderColor:"#E2E8F0" }}>
                <div className="p-4 border-b" style={{ borderColor:"#E2E8F0" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg" style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)" }}/>
                    <div className="h-3 w-14 rounded-full bg-slate-200"/>
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  {[
                    { color:"#18A7B8", label:"Dashboard", active:true },
                    { color:"#2196F3", label:"Leads",     active:false },
                    { color:"#7E57C2", label:"Inbox",     active:false },
                    { color:"#FF9800", label:"Opportunities",active:false },
                    { color:"#F4511E", label:"Segments",  active:false },
                    { color:"#E91E63", label:"Newsletters",active:false },
                    { color:"#43A047", label:"Analytics", active:false },
                  ].map((item) => (
                    <div key={item.label}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{ background: item.active ? item.color+"18" : "transparent" }}>
                      <div className="h-3 w-3 rounded" style={{ background: item.color, opacity: item.active ? 1 : 0.4 }}/>
                      <div className="h-2.5 rounded-full" style={{ width:`${item.label.length * 6}px`, background: item.active ? item.color : "#CBD5E1" }}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main content */}
              <div className="ml-48 p-6">
                {/* Stat cards row */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { color:"#18A7B8", n:"2,481", sub:"Total Leads"   },
                    { color:"#2196F3", n:"14",    sub:"Active Campaigns" },
                    { color:"#7E57C2", n:"38",    sub:"Inbox Replies" },
                    { color:"#FF9800", n:"$92k",  sub:"Pipeline Value" },
                  ].map((s) => (
                    <div key={s.sub} className="bg-white rounded-xl p-4 border" style={{ borderColor:"#E2E8F0" }}>
                      <div className="h-7 w-7 rounded-lg mb-3" style={{ background: s.color+"22" }}>
                        <div className="h-full w-full rounded-lg" style={{ background: s.color, opacity:0.5 }}/>
                      </div>
                      <div className="text-lg font-black text-slate-900">{s.n}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Chart + list row */}
                <div className="grid grid-cols-5 gap-4">
                  {/* Bar chart */}
                  <div className="col-span-3 bg-white rounded-xl p-4 border" style={{ borderColor:"#E2E8F0" }}>
                    <div className="h-2.5 w-24 rounded-full bg-slate-200 mb-4"/>
                    <div className="flex items-end gap-2 h-28">
                      {[60,85,45,100,70,55,90].map((h,i) => (
                        <div key={i} className="flex-1 rounded-t-lg transition-all"
                          style={{ height:`${h}%`, background:`linear-gradient(to top, #18A7B8, #7E57C2)`, opacity:0.7+i*0.04 }}/>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {["M","T","W","T","F","S","S"].map((d,i) => (
                        <div key={i} className="flex-1 text-center text-[9px] text-slate-400">{d}</div>
                      ))}
                    </div>
                  </div>

                  {/* Lead list */}
                  <div className="col-span-2 bg-white rounded-xl p-4 border" style={{ borderColor:"#E2E8F0" }}>
                    <div className="h-2.5 w-16 rounded-full bg-slate-200 mb-3"/>
                    <div className="space-y-2.5">
                      {[
                        { init:"SC", color:"#18A7B8", w:60 },
                        { init:"MR", color:"#7E57C2", w:75 },
                        { init:"PS", color:"#43A047", w:50 },
                        { init:"AK", color:"#FF9800", w:65 },
                      ].map((r) => (
                        <div key={r.init} className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                            style={{ background: r.color }}>{r.init}</div>
                          <div className="h-2 rounded-full flex-1 bg-slate-100">
                            <div className="h-full rounded-full" style={{ width:`${r.w}%`, background: r.color+"88" }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
              style={{ background:"rgba(15,23,42,0.18)" }}>
              <div
                className="flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 group-hover:scale-110"
                style={{
                  height:"84px", width:"84px",
                  background:"white",
                  boxShadow:"0 8px 40px rgba(24,167,184,.45), 0 2px 12px rgba(0,0,0,.12)",
                }}>
                <div className="flex items-center justify-center rounded-full"
                  style={{ height:"60px", width:"60px", background:"linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                  <Play className="h-6 w-6 text-white" style={{ marginLeft:"3px" }}/>
                </div>
              </div>
            </div>

            {/* Animated pulse rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute rounded-full animate-ping"
                style={{ height:"108px", width:"108px", background:"rgba(24,167,184,.15)", animationDuration:"1.8s" }}/>
              <div className="absolute rounded-full animate-ping"
                style={{ height:"136px", width:"136px", background:"rgba(24,167,184,.08)", animationDuration:"1.8s", animationDelay:"0.4s" }}/>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            No sign-up required to watch · 2 min · HD
          </p>
        </div>
      </section>

      {/* Lightbox modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background:"rgba(10,15,25,.85)", backdropFilter:"blur(8px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ background:"#0D1627" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor:"rgba(255,255,255,.08)" }}>
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                  <svg viewBox="0 0 32 32" fill="none" className="h-4 w-4">
                    <path d="M7 24 L7 8 L19 22 L19 8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 15 L26 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
                    <circle cx="26" cy="8" r="2.2" fill="white"/>
                  </svg>
                </div>
                <span className="text-sm font-bold text-white">Nxelio — Product Demo</span>
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="h-4 w-4 text-white/70"/>
              </button>
            </div>

            {/* Video placeholder — swap src for real video embed URL */}
            <div className="relative" style={{ paddingBottom:"56.25%" }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                style={{ background:"linear-gradient(135deg,#0D1627,#1a1f35)" }}>
                <div className="flex items-center justify-center rounded-full"
                  style={{ height:"72px", width:"72px", background:"linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow:"0 8px 32px rgba(24,167,184,.4)" }}>
                  <Play className="h-7 w-7 text-white" style={{ marginLeft:"3px" }}/>
                </div>
                <p className="text-white/60 text-sm font-medium">Replace with your video embed URL</p>
                <p className="text-white/30 text-xs">e.g. YouTube or Loom iframe src</p>
              </div>
              {/*
                To embed a real video, replace the div above with:
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID?autoplay=1"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              */}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  useReveal();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive:true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const openDemoModal = () => setShowDemoModal(true);

  return (
    <div className="landing-page min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <Navbar scrolled={scrolled} mobileOpen={mobileOpen} toggle={() => setMobileOpen((v)=>!v)} onBookDemo={openDemoModal}/>
      <Hero onBookDemo={openDemoModal}/>
      <DemoVideo/>
      <BrandsSection/>
      <StatsSection/>
      <FeaturesSection/>
      <CRMDemos/>
      <HowItWorks/>
      <Pricing/>
      <Testimonials/>
      <FAQ/>
      <CTABanner onBookDemo={openDemoModal}/>
      <Footer/>
      <BookDemoModal open={showDemoModal} onClose={() => setShowDemoModal(false)}/>
      <AiAssistantWidget/>
    </div>
  );
}
