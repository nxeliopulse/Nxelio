import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandVisualPanel } from "@/components/brand/brand-visual-panel";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#0a0a0d] font-sans overflow-hidden">

      {/* LEFT: dark surround holding the wizard's own light panel. The wizard
          (multi-step form using the app-wide Card/Input/Select components)
          stays untouched here rather than converted to a dark theme — those
          components are shared with the rest of the app, and forcing them
          dark would mean re-auditing every dashboard screen that uses them. */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 overflow-y-auto">
        <div className="force-light-theme w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-5 sm:p-8 my-auto">
          {children}
        </div>
      </div>

      <BrandVisualPanel
        statHeadline="Almost there."
        statBody="A few quick steps and your AI co-pilot is ready to go."
        cta={null}
      />
    </div>
  );
}
