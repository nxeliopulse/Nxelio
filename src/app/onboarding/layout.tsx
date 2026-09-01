import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandVisualPanel } from "@/components/brand/brand-visual-panel";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="h-screen w-full flex flex-col lg:flex-row bg-[#0a0a0d] font-sans overflow-y-auto lg:overflow-hidden p-3 sm:p-4 lg:p-6 gap-3 sm:gap-4 lg:gap-6">

      {/* LEFT: light panel holding the wizard. The black gap/padding on the
          outer container and the rounded corners here keep the dark
          background visible as a frame around both panels at every size,
          instead of the panels going edge-to-edge flush with the screen.
          The wizard (multi-step form using the app-wide Card/Input/Select
          components) stays untouched here rather than converted to a dark
          theme — those components are shared with the rest of the app, and
          forcing them dark would mean re-auditing every dashboard screen
          that uses them. */}
      <div className="force-light-theme flex-1 bg-white overflow-y-auto rounded-2xl">
        <div className="w-full max-w-2xl mx-auto px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </div>
      </div>

      <BrandVisualPanel
        statHeadline="Almost there."
        statBody="A few quick steps and your AI co-pilot is ready to go."
        cta={null}
        variant="straight"
        mockup={false}
      />
    </div>
  );
}
