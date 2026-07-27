"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { SupportWidget } from "@/components/support/support-widget";
import { FeedbackProvider } from "@/components/ui/feedback";
import { OnboardingBanner } from "@/components/layout/onboarding-banner";
import { NoMailboxBanner } from "@/components/layout/no-mailbox-banner";
import { AssistantProvider } from "@/components/layout/assistant-context";

interface Props {
  userName: string;
  userEmail: string;
  userRole: string;
  navAccess?: Record<string, boolean> | null;
  onboardingCompleted?: boolean;
  mailboxConnected?: boolean;
  children: React.ReactNode;
}

function Shell({ userName, userEmail, userRole, navAccess, onboardingCompleted = true, mailboxConnected = true, children }: Props) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  return (
    <AssistantProvider toggle={() => setAssistantOpen((v) => !v)}>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar role={userRole} navAccess={navAccess} />
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} role={userRole} navAccess={navAccess} />
        <div className={cn("flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--primary)]", assistantExpanded && "hidden")}>
          <Topbar
            userName={userName}
            userEmail={userEmail}
            userRole={userRole}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
            assistantOpen={assistantOpen}
          />
          {!onboardingCompleted ? <OnboardingBanner /> : !mailboxConnected && <NoMailboxBanner />}
          {/* Its own scroll region (not the page) — keeps the rounded top-left
              corner anchored to the viewport instead of scrolling away with content. */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 bg-slate-50 rounded-tl-2xl">{children}</main>
        </div>
        {/* Renders as a flex column on desktop — the content area shrinks to share the window */}
        <AssistantWidget open={assistantOpen} onClose={() => setAssistantOpen(false)} onExpandChange={setAssistantExpanded} />
        {/* Support help bot — floating FAB bottom-right; shifts left when the AI panel is open */}
        <SupportWidget assistantOpen={assistantOpen} assistantExpanded={assistantExpanded} />
      </div>
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
