import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getSubscription } from "@/lib/queries/subscriptions";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Hard onboarding gate — runs BEFORE the subscription check, since a
  // brand-new workspace has no subscription row yet either; checking
  // subscription first would let someone pay before finishing onboarding.
  const onboardingStatus = await getOnboardingStatus();
  if (!onboardingStatus.completed) return <OnboardingGate status={onboardingStatus} />;

  // Card-first gate: a brand-new workspace has no subscription row at all
  // until checkout completes (see migration 0035). Block the whole dashboard
  // until that happens — nothing else here matters if there's no subscription.
  const subscription = await getSubscription();
  if (!subscription) return <SubscriptionGate />;

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, role_id, nav_access, roles(role_name)")
    .eq("user_id", user.id)
    .single();

  const userName = profile?.full_name || user.email?.split("@")[0] || "User";
  const userEmail = profile?.email || user.email || "";
  const userRole =
    (profile as { roles?: { role_name?: string } } | null)?.roles?.role_name || "User";
  const navAccess =
    (profile as { nav_access?: Record<string, boolean> | null } | null)?.nav_access ?? null;

  return (
    <AppShell
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      navAccess={navAccess}
    >
      {children}
    </AppShell>
  );
}
