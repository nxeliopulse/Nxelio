import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getSubscription } from "@/lib/queries/subscriptions";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { getCurrentWorkspace } from "@/lib/queries/workspaces";
import { isPlatformAdminEmail } from "@/lib/auth/platform-admin-identity";
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
  // Checked against the user already fetched above rather than via
  // isPlatformAdmin(), which would re-fetch the session over the network.
  if (isPlatformAdminEmail(user.email)) redirect("/admin");

  // Everything this layout needs, fetched together.
  //
  // These were five sequential awaits, each waiting on the last, and this
  // layout runs on EVERY page in the app — it is the first thing a user waits
  // for after signing in. None of them depend on one another: they all just
  // need `user`, which we already have. Issued as one batch, the page waits
  // for the slowest instead of the sum.
  //
  // The gates below are still evaluated in their original order (subscription
  // before onboarding) — only the fetching is parallel, not the decisions. The
  // cost is that a gated user now also fetches a profile and workspace it will
  // not render; that is a rare path, and worth it to take four round-trips off
  // the common one.
  //
  // workspace_id rides along on the profile select rather than getting its own
  // query — both read the same users row, and the membership check below wants
  // only that one column.
  const [
    { data: profile },
    subscription,
    onboardingStatus,
    workspace,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("workspace_id, full_name, email, role_id, nav_access, roles(role_name)")
      .eq("user_id", user.id)
      .single(),
    getSubscription(),
    getOnboardingStatus(),
    getCurrentWorkspace(),
  ]);

  // If an admin removed this login's access to its currently-active workspace
  // (updateUserStatus on workspace_members) since their last request, their
  // users.workspace_id pointer may now point at a workspace they're no longer
  // a member of — don't silently render with stale access. Necessarily a
  // follow-up query: it needs the workspace_id the batch above just resolved.
  const activeWorkspaceId = (profile as { workspace_id?: string | null } | null)?.workspace_id;
  if (activeWorkspaceId) {
    const { data: activeMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (!activeMembership) {
      await supabase.auth.signOut();
      redirect("/login");
    }
  }

  // Subscription gate first — a cancelled user should see the subscription
  // page, not be stuck on the onboarding gate they can never complete.
  if (!subscription || subscription.status === "canceled") return <SubscriptionGate />;

  // Onboarding gate — runs after subscription check so cancelled users
  // aren't blocked behind an onboarding step they can't proceed past.
  if (!onboardingStatus.completed) return <OnboardingGate status={onboardingStatus} />;

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
      workspaceName={workspace?.name ?? ""}
      idleTimeoutMinutes={getIdleTimeoutMinutes()}
      warningLeadMinutes={getWarningLeadMinutes()}
    >
      {children}
    </AppShell>
  );
}
