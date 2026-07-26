"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown, LogOut, User as UserIcon, Settings, Menu, Sparkles,
  Phone, ShoppingBag, HelpCircle, ArrowUpRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NotificationsBell } from "./notifications-bell";
import { useSidebar } from "./sidebar-context";

interface TopbarProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onToggleAssistant?: () => void;
  assistantOpen?: boolean;
}

export function Topbar({ userName = "Guest", userEmail = "", onToggleAssistant, assistantOpen = false }: TopbarProps) {
  const router = useRouter();
  const { toggleMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = userName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-[var(--primary)] border-b border-white/10 px-3 sm:px-4 lg:px-5 flex items-center justify-between gap-3 sticky top-0 z-30 text-white shadow-sm">
      {/* Left side: hamburger (mobile) */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Hamburger — mobile/tablet only */}
        <button
          onClick={toggleMobile}
          className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/80 flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right side: HubSpot style top action tools */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Upgrade pill */}
        <Link
          href="/billing"
          className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-medium text-white transition-colors"
        >
          <ArrowUpRight className="h-3.5 w-3.5 text-amber-300" />
          <span>Upgrade</span>
        </Link>

        {/* Calling / Phone icon */}
        <button
          onClick={() => router.push("/meetings")}
          title="Phone / Calling"
          className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <Phone className="h-4 w-4" />
        </button>

        {/* App Marketplace icon */}
        <button
          onClick={() => router.push("/settings?section=email")}
          title="App Marketplace & Integrations"
          className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <ShoppingBag className="h-4 w-4" />
        </button>

        {/* Help icon */}
        <Link
          href="/help"
          title="Help & Support"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>

        {/* Settings gear icon ⚙️ */}
        <Link
          href="/settings"
          title="Settings"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {/* Notifications bell */}
        <NotificationsBell className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white" />

        <div className="h-4 w-px bg-white/20 mx-0.5" />

        {/* AI Assistant button */}
        <button
          onClick={onToggleAssistant}
          aria-label={assistantOpen ? "Close AI assistant" : "Open AI assistant"}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-[var(--primary)] bg-white hover:bg-white/90 transition-all ${
            assistantOpen ? "ring-2 ring-white/70" : ""
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Assistant</span>
        </button>

        {/* User Workspace Profile dropdown (HubSpot "Wisely" style) */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-lg hover:bg-white/10 text-white/90 transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            <span className="hidden lg:inline-block text-xs font-medium max-w-[100px] truncate text-white/90">
              {userName}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-white/70 flex-shrink-0" />
          </button>

          {open && (
            <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 text-slate-900">
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{userName}</p>
                <p className="text-xs text-slate-500 truncate">{userEmail}</p>
              </div>
              <div className="p-1">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  <UserIcon className="h-4 w-4 text-slate-400" /> Profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Settings className="h-4 w-4 text-slate-400" /> Settings
                </Link>
              </div>
              <div className="p-1 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
