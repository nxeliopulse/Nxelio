"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { FeedbackProvider } from "@/components/ui/feedback";
import { NoMailboxBanner } from "@/components/layout/no-mailbox-banner";
import { AssistantProvider } from "@/components/layout/assistant-context";
import { TourProvider } from "@/components/tour/tour-context";
import { CURRENT_VERSIONS } from "@/components/tour/tour-registry";
import { markTourSeen } from "@/lib/queries/tour";
import type { MyWorkspaceRow } from "@/lib/queries/workspaces";

interface Props {
  userName: string;
  userEmail: string;
  userRole: string;
  navAccess?: Record<string, boolean> | null;
  onboardingCompleted?: boolean;
  mailboxConnected?: boolean;
  workspaces?: MyWorkspaceRow[];
  children: React.ReactNode;
}

function Shell({ userName, userEmail, userRole, navAccess, onboardingCompleted = true, mailboxConnected = true, workspaces = [], children }: Props) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  return (
    <AssistantProvider toggle={() => setAssistantOpen((v) => !v)}>
      <TourProvider onTourEnd={(pageKey) => { markTourSeen(pageKey, CURRENT_VERSIONS[pageKey] ?? "1").catch(() => {}); }}>
        <div className="flex h-screen overflow-hidden bg-[linear-gradient(to_right,var(--sidebar-bg),var(--topbar-bg))]">
          <Sidebar role={userRole} navAccess={navAccess} />
          <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} role={userRole} navAccess={navAccess} />
          <div className={cn("flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent", assistantExpanded && "hidden")}>
            <Topbar
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
              workspaces={workspaces}
              onToggleAssistant={() => setAssistantOpen((v) => !v)}
              assistantOpen={assistantOpen}
            />
            {onboardingCompleted && !mailboxConnected && <NoMailboxBanner />}
            {/* Its own scroll region (not the page) — keeps the rounded top-left
                corner anchored to the viewport instead of scrolling away with content. */}
            <main className={cn(
              "relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 bg-slate-50 rounded-tl-2xl transition-all duration-300",
              assistantOpen && "rounded-2xl mr-2.5 mb-2.5"
            )}>
              {children}
            </main>
          </div>
          {/* Renders as a flex column on desktop — the content area shrinks to share the window */}
          <AssistantWidget open={assistantOpen} onClose={() => setAssistantOpen(false)} onExpandChange={setAssistantExpanded} />
        </div>
      </TourProvider>
    </AssistantProvider>
  );
}

export function AppShell(props: Props) {
  return (
    <FeedbackProvider>
      <SidebarProvider>
        <Shell {...props} />
      </SidebarProvider>
    </FeedbackProvider>
  );
}
