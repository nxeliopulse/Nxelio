"use client";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { SupportWidget } from "@/components/support/support-widget";
import { FeedbackProvider } from "@/components/ui/feedback";

interface Props {
  userName: string;
  userEmail: string;
  userRole: string;
  navAccess?: Record<string, boolean> | null;
  children: React.ReactNode;
}

function Shell({ userName, userEmail, userRole, navAccess, children }: Props) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={userRole} navAccess={navAccess} />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} role={userRole} navAccess={navAccess} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          onToggleAssistant={() => setAssistantOpen((v) => !v)}
          assistantOpen={assistantOpen}
        />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden">{children}</main>
      </div>
      {/* Renders as a flex column on desktop — the content area shrinks to share the window */}
      <AssistantWidget open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      {/* Support help bot — floating FAB bottom-right; shifts left when the AI panel is open */}
      <SupportWidget assistantOpen={assistantOpen} />
    </div>
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
