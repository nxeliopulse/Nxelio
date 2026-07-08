"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, LogOut, User as UserIcon, Settings, Menu, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
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
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sticky top-0 z-30">
      {/* Left side: hamburger (mobile) + search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Hamburger — mobile/tablet only */}
        <button
          onClick={toggleMobile}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-700 flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search — visible on tablet+, hidden on tiny phones */}
        <div className="hidden sm:flex flex-1 max-w-md">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search..."
            className="bg-slate-50 border-transparent focus:bg-white"
          />
        </div>
      </div>

      {/* Right side: actions */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Mobile search icon — only on phones */}
        <button className="sm:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <Search className="h-5 w-5" />
        </button>

        {/* AI Assistant launcher — rectangle pill with icon + label */}
        <button
          onClick={onToggleAssistant}
          aria-label={assistantOpen ? "Close AI assistant" : "Open AI assistant"}
          className={`flex items-center gap-1.5 rounded-lg font-semibold text-sm transition-all flex-shrink-0 px-2.5 sm:px-3 py-2 text-white bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 shadow-sm shadow-blue-500/30 ${
            assistantOpen ? "ring-2 ring-blue-300 shadow-md" : "hover:shadow-md hover:brightness-105 active:scale-[0.98]"
          }`}
        >
          <Sparkles className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        <NotificationsBell />

        <div className="hidden sm:block h-8 w-px bg-slate-200 mx-1" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 pl-1 pr-1 sm:pr-2 py-1 rounded-lg hover:bg-slate-50"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="hidden md:block text-left max-w-[140px]">
              <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{userName}</p>
            </div>
            <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          </button>

          {open && (
            <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 w-60 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-40">
              <div className="p-3 border-b border-slate-100">
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
