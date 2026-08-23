import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getSubscription } from "@/lib/queries/subscriptions";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { getMyWorkspaces } from "@/lib/queries/workspaces";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { getIdleTimeoutMinutes, getWarningLeadMinutes } from "@/lib/idle-timeout-config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The platform admin login (admin@nxelio.com) isn't a real tenant — it exists
  // only to manage every customer workspace from /admin, not to run campaigns
  // itself. It still has a `users` row (tied to some workspace) for legacy
  // reasons, so without this it would hit the same onboarding/subscription
  // gates as any customer. Send it straight to the admin panel instead.
  if (await isPlatformAdmin()) redirect("/admin");

  // OAuth users (Google, LinkedIn) skip the login OTP gate — they already
  // went through their provider's own 2FA. Email+password users must verify
  // a 6-digit code each session; the cookie is set by verifyLoginOtp().
  const provider = (user.app_metadata as { provider?: string } | null)?.provider;
  const isOAuth = provider === "google" || provider === "linkedin_oidc";
  if (!isOAuth) {
    const cookieStore = await cookies();
    if (!cookieStore.get("login_otp_verified")?.value) {
      redirect(`/verify-login?email=${encodeURIComponent(user.email ?? "")}`);
    }
  }

  // If an admin removed this login's access to its currently-active workspace
  // (updateUserStatus on workspace_members) since their last request, their
  // users.workspace_id pointer may now point at a workspace they're no longer
  // a member of — don't silently render with stale access.
  const { data: activeCheck } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  if (activeCheck?.workspace_id) {
    const { data: activeMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", activeCheck.workspace_id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (!activeMembership) {
      await supabase.auth.signOut();
      redirect("/login");
    }
  }

  // Subscription gate first — a cancelled user should see the subscription
  // page, not be stuck on the onboarding gate they can never complete.
  const subscription = await getSubscription();
  if (!subscription || subscription.status === "canceled") return <SubscriptionGate />;

  // Onboarding gate — runs after subscription check so cancelled users
  // aren't blocked behind an onboarding step they can't proceed past.
  const onboardingStatus = await getOnboardingStatus();
  if (!onboardingStatus.completed) return <OnboardingGate status={onboardingStatus} />;

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

  const workspaces = await getMyWorkspaces();

  return (
    <AppShell
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      navAccess={navAccess}
      workspaces={workspaces}
      idleTimeoutMinutes={getIdleTimeoutMinutes()}
      warningLeadMinutes={getWarningLeadMinutes()}
    >
      {children}
    </AppShell>
  );
}
