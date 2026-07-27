import Link from "next/link";
import { Users, Mail, Target, BarChart3, Check } from "lucide-react";

const BRANDS = ["ClickUp","Zoom","Salesforce","Microsoft","HubSpot","Notion"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 lg:p-8"
      style={{ background: "linear-gradient(135deg,#0a1628 0%,#0d1f3c 100%)" }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full"
          style={{ background:"radial-gradient(circle,rgba(24,167,184,.18) 0%,transparent 70%)" }}/>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full"
          style={{ background:"radial-gradient(circle,rgba(126,87,194,.15) 0%,transparent 70%)" }}/>
      </div>

      {/* Card */}
      <div className="relative w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex"
        style={{ boxShadow:"0 32px 80px rgba(0,0,0,.6)" }}>

        {/* ── LEFT BRAND PANEL ── */}
        <div className="hidden lg:flex flex-col w-[44%] relative overflow-hidden"
          style={{ background:"linear-gradient(160deg,#18A7B8 0%,#0d8fa0 40%,#0a6b7a 100%)" }}>

          {/* Blob decoration */}
          <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full"
            style={{ background:"rgba(255,255,255,.07)" }}/>
          <div className="absolute top-1/2 right-0 w-48 h-48 rounded-full -translate-y-1/2 translate-x-1/2"
            style={{ background:"rgba(126,87,194,.25)" }}/>

          <div className="relative flex flex-col h-full p-10">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 mb-10">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background:"rgba(255,255,255,.2)", border:"1.5px solid rgba(255,255,255,.35)" }}>
                <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5">
                  <path d="M7 24 L7 8 L19 22 L19 8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 15 L26 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
                  <circle cx="26" cy="8" r="2.2" fill="white"/>
                </svg>
              </div>
              <span className="font-bold text-white text-lg tracking-tight">Nxelio Nurture</span>
            </Link>

            {/* Tagline */}
            <div className="mb-8">
              <h2 className="text-2xl font-black text-white leading-snug mb-3">
                Join 2,400+ revenue teams closing more deals
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                Everything you need to find leads, run campaigns, and win pipeline — in one workspace.
              </p>
            </div>

            {/* Feature pills */}
            <div className="space-y-2.5 mb-8">
              {[
                { icon: Users,    text:"Lead import & management"     },
                { icon: Mail,     text:"AI email campaigns"           },
                { icon: Target,   text:"Opportunities pipeline"       },
                { icon: BarChart3,text:"Real-time analytics"          },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background:"rgba(255,255,255,.2)" }}>
                    <Icon className="h-3.5 w-3.5 text-white"/>
                  </div>
                  <span className="text-sm text-white/90 font-medium">{text}</span>
                </div>
              ))}
            </div>

            {/* Trust badges */}
            <div className="mt-auto">
              <p className="text-[10px] text-white/45 uppercase tracking-widest mb-3">Trusted alongside</p>
              <div className="flex flex-wrap gap-2">
                {BRANDS.map((b) => (
                  <span key={b}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background:"rgba(255,255,255,.12)", color:"rgba(255,255,255,.7)" }}>
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Free trial note */}
            <div className="mt-6 flex items-center gap-2">
              <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background:"rgba(255,255,255,.25)" }}>
                <Check className="h-3 w-3 text-white"/>
              </div>
              <span className="text-xs text-white/70 font-medium">7-day free trial · card required · no charge until day 7</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ── */}
        <div className="flex-1 flex flex-col" style={{ background:"#0f172a" }}>
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 p-6 pb-0">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
              <svg viewBox="0 0 32 32" fill="none" className="h-4 w-4">
                <path d="M7 24 L7 8 L19 22 L19 8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 15 L26 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
                <circle cx="26" cy="8" r="2.2" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-white text-base">Nxelio Nurture</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
            <div className="w-full max-w-sm">
              {children}
            </div>
          </div>

          {/* Bottom note */}
          <div className="px-8 py-4 text-center text-[11px] border-t"
            style={{ borderColor:"rgba(255,255,255,.06)", color:"rgba(255,255,255,.3)" }}>
            Protected · SOC 2-ready · GDPR · Workspace-isolated data
          </div>
        </div>
      </div>
    </div>
  );
}
