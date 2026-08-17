import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

/** Abstract "product preview" card — a lightweight, on-brand stand-in for a
 *  real screenshot, echoing the reference layout's dashboard mockup without
 *  depending on any external asset. */
function BrandMockup() {
  return (
    <div className="relative z-10 rounded-2xl p-4 mb-8" style={{ background: "rgba(255,255,255,.12)" }}>
      <div className="flex items-center gap-2 mb-3.5">
        <div className="h-8 w-8 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,.35)" }} />
        <div className="h-2.5 w-24 rounded-full" style={{ background: "rgba(255,255,255,.35)" }} />
        <div className="h-2.5 w-10 rounded-full ml-auto" style={{ background: "rgba(255,255,255,.22)" }} />
      </div>
      {[88, 62, 74].map((w, i) => (
        <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,.5)" }} />
          <div className="h-2 rounded-full" style={{ width: `${w}%`, background: "rgba(255,255,255,.28)" }} />
        </div>
      ))}
    </div>
  );
}

function BrandPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-[42%] relative flex-col justify-between p-10 text-white overflow-hidden flex-shrink-0"
      style={{ background: "linear-gradient(160deg, #18A7B8 0%, #5B3FA6 100%)" }}
    >
      <div className="absolute -top-12 -right-16 h-56 w-56 rounded-full" style={{ background: "rgba(255,255,255,.08)" }} />
      <div className="absolute bottom-28 -left-12 h-40 w-40 rounded-3xl rotate-12" style={{ background: "rgba(255,255,255,.08)" }} />
      <div className="absolute top-1/3 right-10 h-8 w-8 rounded-full" style={{ background: "rgba(255,255,255,.15)" }} />

      <Link href="/" className="relative z-10 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0 bg-white shadow-sm flex items-center justify-center">
          <LogoMark className="h-full w-full" />
        </div>
        <span className="font-bold text-base tracking-tight">Nxelio Nurture</span>
      </Link>

      <div>
        <BrandMockup />
        <h2 className="relative z-10 text-2xl font-black leading-tight mb-2">
          Let&apos;s turn every lead<br />into real pipeline.
        </h2>
        <p className="relative z-10 text-sm text-white/70 max-w-[280px]">
          Your AI-powered co-pilot for finding leads, running campaigns, and closing deals.
        </p>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light-theme min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div
        className="w-full max-w-5xl rounded-[28px] bg-white shadow-2xl overflow-hidden flex flex-col lg:flex-row"
        style={{ boxShadow: "0 30px 70px rgba(30,20,90,.18)" }}
      >
        <BrandPanel />

        <div className="flex-1 min-w-0 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
          <Link href="/" className="flex lg:hidden items-center gap-2 mb-5">
            <div className="h-7 w-7 rounded-lg overflow-hidden flex-shrink-0 bg-white shadow-sm ring-1 ring-slate-900/5 flex items-center justify-center">
              <LogoMark className="h-full w-full" />
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight">Nxelio Nurture</span>
          </Link>

          <div className="w-full max-w-sm mx-auto lg:mx-0">
            {children}

            <div className="mt-5 pt-3 text-center text-[10px] border-t border-slate-100 text-slate-400">
              Protected · SOC 2-ready · GDPR · Workspace-isolated data
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
