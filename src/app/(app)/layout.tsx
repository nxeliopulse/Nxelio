import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getOnboarding } from "@/lib/queries/onboarding";
import { getSubscription } from "@/lib/queries/subscriptions";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { getMyWorkspaces } from "@/lib/queries/workspaces";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  // Card-first gate: a brand-new workspace has no subscription row at all
  // until checkout completes (see migration 0035). Block the whole dashboard
  // until that happens — nothing else here matters if there's no subscription.
  const subscription = await getSubscription();
  if (!subscription) return <SubscriptionGate />;

  // Soft onboarding: new signups are sent to /onboarding from signup, and anyone
  // who hasn't finished sees a banner (below) — no hard lockout.
  const { completed: onboardingCompleted } = await getOnboarding();

  // LP-2 — a "no mailbox connected" banner shows until at least one email
  // mailbox is connected for the workspace.
  const { count: mailboxCount } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "connected");
  const mailboxConnected = (mailboxCount || 0) > 0;

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
      onboardingCompleted={onboardingCompleted}
      mailboxConnected={mailboxConnected}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
