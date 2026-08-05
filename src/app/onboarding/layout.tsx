import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="force-light-theme min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
        <div className="flex gap-10 items-start">
          <div className="flex-1 min-w-0">
            {children}
          </div>

          {/* Decorative assistant panel — desktop only, stays in view alongside the (possibly tall) wizard steps.
              Height is capped (not width-driven) so a wide panel can't stretch the whole page taller than the viewport. */}
          <div className="hidden lg:block w-[460px] flex-shrink-0 sticky top-4 mt-6">
            <div className="relative rounded-3xl overflow-hidden shadow-xl flex items-center justify-center p-8 h-[55vh] max-h-[460px]"
              style={{ background: "linear-gradient(135deg,#18A7B8 0%,#5B3FA6 100%)" }}>
              <div className="absolute -top-8 -left-8 h-28 w-28 rounded-full" style={{ background: "rgba(255,255,255,.12)" }} />
              <div className="absolute -bottom-10 -right-6 h-32 w-32 rounded-full" style={{ background: "rgba(255,255,255,.1)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative illustration, not worth Next/Image's constraints here */}
              <img src="/illustrations/onboarding-assistant-nobg.png" alt="" className="relative max-h-full w-auto max-w-full object-contain drop-shadow-2xl animate-float-gentle" />
            </div>
            <p className="mt-3 text-center text-sm text-slate-400 px-2">
              A few quick steps and your AI co-pilot is ready to go.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
