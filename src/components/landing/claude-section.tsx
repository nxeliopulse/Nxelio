import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Clock, FileSpreadsheet, LayoutList,
  Mail, MessageSquare, Search, Sparkles, Zap,
} from "lucide-react";

function BrowserChrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-t-xl bg-slate-100 border border-b-0 border-slate-200 px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
      <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
      <span className="ml-2 text-[9px] font-medium text-slate-400 truncate">{label}</span>
    </div>
  );
}

const USE_CASES = [
  {
    title: "Drafting outreach",
    desc: "Turn a few bullet points into a personalized email or LinkedIn message, in your voice.",
    icon: Mail,
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    chrome: "compose.nxelio.com",
    preview: (
      <div className="space-y-1.5">
        <div className="h-1.5 bg-slate-200 rounded-full w-4/5" />
        <div className="h-1.5 bg-slate-200 rounded-full w-3/5" />
        <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 mt-2">
          <span className="text-[9px] text-slate-400 flex-1 truncate">Hi Sarah, saw your team is hiring…</span>
          <span className="text-[8px] font-semibold text-white bg-blue-600 px-1.5 py-1 rounded-md shrink-0">Send</span>
        </div>
      </div>
    ),
  },
  {
    title: "Summarizing sales calls",
    desc: "Turn a call transcript into a clean summary with next steps, instead of typing notes by hand.",
    icon: MessageSquare,
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-600",
    chrome: "calls.nxelio.com",
    preview: (
      <div className="space-y-1.5">
        {["Follow up next Tuesday", "Send pricing one-pager", "Loop in VP Sales"].map((item) => (
          <div key={item} className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-[9px] text-slate-500 truncate">{item}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Researching a lead",
    desc: "Pull together what's public about a company or contact before you reach out.",
    icon: Search,
    iconBg: "bg-gradient-to-br from-purple-500 to-fuchsia-600",
    chrome: "research.nxelio.com",
    preview: (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-slate-300 rounded-full w-3/4 mb-1.5" />
          <div className="h-1.5 bg-slate-200 rounded-full w-1/2" />
        </div>
        <Search className="w-3.5 h-3.5 text-purple-500 shrink-0" />
      </div>
    ),
  },
  {
    title: "Building playbooks",
    desc: "Describe the outreach sequence you want in plain English and get a first draft of the steps.",
    icon: LayoutList,
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    chrome: "playbooks.nxelio.com",
    preview: (
      <div className="space-y-1.5">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-bold flex items-center justify-center shrink-0">{n}</span>
            <div className="h-1.5 bg-slate-200 rounded-full flex-1" />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Cleaning up lead lists",
    desc: "Standardize messy job titles, company names, and locations in an imported CSV.",
    icon: FileSpreadsheet,
    iconBg: "bg-gradient-to-br from-sky-500 to-cyan-600",
    chrome: "import.nxelio.com",
    preview: (
      <div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`h-2.5 rounded-sm ${i % 3 === 0 ? "bg-sky-200" : "bg-slate-200"}`} />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-2 text-[9px] font-semibold text-sky-600">
          <FileSpreadsheet className="w-3 h-3" /> Cleaned
        </div>
      </div>
    ),
  },
];

const BENEFITS = [
  { text: "Save hours on first drafts", icon: Clock, iconClass: "text-amber-300" },
  { text: "Keep your team's tone consistent", icon: Sparkles, iconClass: "text-amber-300 fill-amber-300" },
  { text: "Fewer copy-paste mistakes between tools", icon: CheckCircle2, iconClass: "text-emerald-300" },
  { text: "One place to use it, once it ships", icon: Zap, iconClass: "text-blue-300 fill-blue-300" },
];

function ClaudeHeroMockup() {
  return (
    <div className="max-w-4xl mx-auto mb-16 rounded-[26px] bg-white border border-slate-200 shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 bg-slate-100 border-b border-slate-200 px-4 py-2.5">
        <span className="w-2 h-2 rounded-full bg-red-300" />
        <span className="w-2 h-2 rounded-full bg-amber-300" />
        <span className="w-2 h-2 rounded-full bg-emerald-300" />
        <span className="mx-auto text-[10px] font-medium text-slate-400">app.nxelio.com/prospects</span>
        <span className="text-[9px] font-semibold text-slate-400 bg-slate-200/70 px-2 py-0.5 rounded-full shrink-0">
          Concept preview
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/claude-hero-prospects.png"
        alt="Claude, in a Chrome side panel, helping add prospects inside the Nxelio Nurture Prospects page"
        className="w-full h-auto block"
      />
    </div>
  );
}

export function ClaudeSection() {
  return (
    <section id="claude" className="py-24 sm:py-32 bg-transparent">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100 mb-3 bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/25">
            In the Works
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
            We&apos;re bringing Claude into Nxelio Nurture.
          </h2>
          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed">
            Nxelio Nurture&apos;s engine runs on OpenAI and Groq today. We&apos;re exploring Claude as part of our roadmap — here&apos;s how teams already use it for the exact jobs Nxelio Nurture handles.
          </p>
          <div className="flex items-center justify-center gap-2 mt-5 text-sm font-semibold text-blue-50">
            <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
            <span>Powered by Claude</span>
          </div>
        </div>

        <ClaudeHeroMockup />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {USE_CASES.map((useCase) => (
            <div
              key={useCase.title}
              className="rounded-2xl border border-slate-200 bg-white shadow-md hover:shadow-2xl hover-lift-card transition-all duration-300 overflow-hidden"
            >
              <BrowserChrome label={useCase.chrome} />
              <div className="p-3.5 bg-slate-50/60 border-x border-slate-200">
                {useCase.preview}
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-8 h-8 rounded-xl ${useCase.iconBg} flex items-center justify-center shadow-sm shrink-0`}>
                    <useCase.icon className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-[#1f2223]">{useCase.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{useCase.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm text-blue-50 font-medium mt-12">
          {BENEFITS.map((benefit, idx) => (
            <span key={benefit.text} className="contents">
              {idx > 0 && <span className="text-blue-100/60">·</span>}
              <span className="inline-flex items-center gap-1.5">
                <benefit.icon className={`w-3.5 h-3.5 ${benefit.iconClass}`} />
                <span>{benefit.text}</span>
              </span>
            </span>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-white hover:bg-slate-50 text-[#1f2223] font-bold px-6 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            <span>Start your free trial</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
