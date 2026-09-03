"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown, LogOut, User as UserIcon, Settings, Menu, Sparkles,
  Phone, ShoppingBag, HelpCircle, PlayCircle, ArrowUpRight, Search, Users2, Megaphone, Loader2,
  Building2, Check, Plus, Sun, Moon, X, MoreHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { globalSearch, type GlobalSearchResult } from "@/lib/queries/global-search";
import { switchWorkspace, createWorkspace, type MyWorkspaceRow } from "@/lib/queries/workspaces";
import { NotificationsBell } from "./notifications-bell";
import { useSidebar } from "./sidebar-context";
import { Modal } from "@/components/ui/modal";
import { getStoredAppearance, applyTheme, applyAppearance } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface TopbarProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  workspaces?: MyWorkspaceRow[];
  onToggleAssistant?: () => void;
  assistantOpen?: boolean;
}

export function Topbar({ userName = "Guest", userEmail = "", workspaces = [], onToggleAssistant, assistantOpen = false }: TopbarProps) {
  const router = useRouter();
  const { toggleMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(false);

  // Sync with actual resolved theme on mount and whenever the DOM class changes
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      const appearance = getStoredAppearance();
      if (appearance.theme === "system") {
        applyAppearance(appearance);
        update();
      }
    };
    mql.addEventListener("change", onMediaChange);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", onMediaChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    applyTheme(nextDark ? "dark" : "light");
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchResult>({ leads: [], campaigns: [] });
  const [searchError, setSearchError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const parts = userName.trim().split(/\s+/);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : userName.slice(0, 2).toUpperCase() || "?";

  async function handleSwitchWorkspace(id: string) {
    setSwitchError(null);
    setSwitchingId(id);
    const result = await switchWorkspace(id);
    // Reset the spinner either way — the client component instance survives
    // the router navigation below (same layout shell), so leaving switchingId
    // set on success left the spinner stuck next to that workspace forever,
    // only clearing on a full manual page reload.
    setSwitchingId(null);
    if (!result.ok) {
      setSwitchError(result.error || "Couldn't switch workspace.");
      return;
    }
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  async function handleCreateWorkspace() {
    setCreateError(null);
    setCreating(true);
    const result = await createWorkspace(newWorkspaceName);
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error || "Couldn't create the workspace.");
      return;
    }
    setCreateOpen(false);
    setNewWorkspaceName("");
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearchChange(v: string) {
    setSearchQuery(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = v.trim();
    if (q.length < 2) {
      setSearchResults({ leads: [], campaigns: [] });
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setSearchOpen(true);
    setSearchError(null);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await globalSearch(q);
        setSearchResults(res);
      } catch (err) {
        console.error("globalSearch failed:", err);
        setSearchResults({ leads: [], campaigns: [] });
        setSearchError("Search failed. Try again.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  function goToSearch(path: string) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults({ leads: [], campaigns: [] });
    router.push(path);
  }

  const hasSearchResults = searchResults.leads.length > 0 || searchResults.campaigns.length > 0;

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();

    // Revoking the refresh token server-side (signOut's default global scope)
    // is worth one network call — it stops the session being resumed from
    // anywhere else. What isn't worth it is making the person watch a
    // "Logging out…" spinner when the auth server is slow or unreachable, so
    // we stop waiting after 2s and tear the session down locally instead.
    // The local pass is storage-only (no network), so it always completes.
    try {
      const timedOut = await Promise.race([
        supabase.auth.signOut().then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000)),
      ]);
      if (timedOut) await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Never block the redirect on a failed sign-out; clear what we can.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }

    // A full-page replace rather than router.push + router.refresh. Those were
    // two more sequential server round-trips (proxy.ts re-validates the
    // session on each), and refresh() is redundant once we've left the route
    // entirely. A hard navigation also guarantees every cached RSC payload and
    // piece of logged-in React state is dropped — which is what you want on
    // logout — and replace() keeps the app out of the back-button history.
    window.location.replace("/login");
  }

  return (
    <header className="h-16 py-2.5 bg-transparent px-3 sm:px-4 lg:px-5 flex items-center justify-between gap-3 sticky top-0 z-30 text-white">
      {/* Left side: hamburger (mobile) + global search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Hamburger — mobile/tablet only */}
        <button
          onClick={toggleMobile}
          className={cn("lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/80 flex-shrink-0", mobileSearchOpen && "hidden")}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search toggle — phones only; sm+ shows the input directly */}
        <button
          onClick={() => setMobileSearchOpen((v) => !v)}
          className="sm:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/80 flex-shrink-0"
          aria-label={mobileSearchOpen ? "Close search" : "Search"}
        >
          {mobileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </button>

        {/* Global search — leads & campaigns, live as you type */}
        <div className={cn("relative flex-1 max-w-sm", mobileSearchOpen ? "block" : "hidden sm:block")} ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/60 pointer-events-none" />
          <input
            type="text"
            placeholder="Search prospects, campaigns..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchQuery.trim().length >= 2) setSearchOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                goToSearch(`/leads?q=${encodeURIComponent(searchQuery.trim())}`);
              }
              if (e.key === "Escape") setSearchOpen(false);
            }}
            className="w-full h-8 pl-8 pr-8 bg-white/12 hover:bg-white/20 focus:bg-white/25 rounded-full text-xs text-white placeholder-white/65 outline-none transition-all"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/70 animate-spin" />
          )}

          {searchOpen && (
            <div className="lp-anim-pop absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-40 max-h-96 overflow-y-auto text-slate-900">
              {!searchLoading && searchError && (
                <p className="px-4 py-6 text-sm text-red-600 text-center">{searchError}</p>
              )}
              {!searchLoading && !searchError && !hasSearchResults && (
                <p className="px-4 py-6 text-sm text-slate-500 text-center">No prospects or campaigns match &quot;{searchQuery.trim()}&quot;.</p>
              )}
              {searchResults.leads.length > 0 && (
                <div className="p-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Prospects</p>
                  {searchResults.leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => goToSearch(`/leads/${l.id}`)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-slate-50"
                    >
                      <Users2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 truncate">{l.full_name || l.email || "Unnamed lead"}</span>
                        {l.company_name && <span className="block text-xs text-slate-500 truncate">{l.company_name}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.campaigns.length > 0 && (
                <div className="p-1 border-t border-slate-100">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Campaigns</p>
                  {searchResults.campaigns.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goToSearch(`/campaigns/${c.id}`)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-slate-50"
                    >
                      <Megaphone className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-900 truncate">{c.campaign_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.trim() && (
                <button
                  onClick={() => goToSearch(`/leads?q=${encodeURIComponent(searchQuery.trim())}`)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-slate-50 border-t border-slate-100"
                >
                  <Search className="h-3.5 w-3.5" /> See all prospects matching &quot;{searchQuery.trim()}&quot;
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side: HubSpot style top action tools */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Upgrade pill */}
        <Link
          href="/billing"
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/12 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
        >
          <ArrowUpRight className="h-3.5 w-3.5 text-amber-300" />
          <span>Upgrade</span>
        </Link>

        {/* Calling / Phone icon */}
        <button
          onClick={() => router.push("/meetings")}
          aria-label="Phone / Calling"
          title="Phone / Calling"
          className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <Phone className="h-4 w-4" />
        </button>

        {/* App Marketplace icon */}
        <button
          onClick={() => router.push("/settings?section=email")}
          aria-label="App Marketplace & Integrations"
          title="App Marketplace & Integrations"
          className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <ShoppingBag className="h-4 w-4" />
        </button>

        {/* Replay product tour */}
        <button
          onClick={() => router.push("/dashboard?tour=dashboard")}
          aria-label="Replay product tour"
          title="Replay product tour"
          className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <PlayCircle className="h-4 w-4" />
        </button>

        {/* "More" menu — below md, Upgrade/Phone/Marketplace/Tour above have
            nowhere to go, so they were simply vanishing with no fallback. */}
        <div className="relative md:hidden" ref={moreRef}>
          <button
            onClick={() => setMoreMenuOpen((v) => !v)}
            aria-label="More actions"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreMenuOpen && (
            <div className="lp-anim-pop origin-top-right fixed right-3 sm:absolute sm:right-0 top-14 sm:top-full mt-1.5 w-60 max-w-[calc(100vw-24px)] bg-white dark:bg-[#1b212e] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-50 text-slate-900 dark:text-white p-1">
              <Link
                href="/billing"
                onClick={() => setMoreMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <ArrowUpRight className="h-4 w-4 text-amber-500" /> Upgrade
              </Link>
              <button
                onClick={() => { setMoreMenuOpen(false); router.push("/meetings"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <Phone className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Phone / Calling
              </button>
              <button
                onClick={() => { setMoreMenuOpen(false); router.push("/settings?section=email"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <ShoppingBag className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Marketplace & Integrations
              </button>
              <button
                onClick={() => { setMoreMenuOpen(false); router.push("/dashboard?tour=dashboard"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <PlayCircle className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Replay product tour
              </button>
              <button
                onClick={() => { setMoreMenuOpen(false); onToggleAssistant?.(); }}
                className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <Sparkles className="h-4 w-4 text-purple-500" /> AI Assistant
              </button>
              <button
                onClick={() => { setMoreMenuOpen(false); toggleTheme(); }}
                className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-amber-500 animate-fade-in" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-400 dark:text-slate-500 animate-fade-in" />
                )}
                {isDark ? "Light Mode" : "Dark Mode"}
              </button>
              <Link
                href="/help"
                onClick={() => setMoreMenuOpen(false)}
                className="sm:hidden flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <HelpCircle className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Help & Support
              </Link>
            </div>
          )}
        </div>

        {/* Help icon */}
        <Link
          href="/help"
          aria-label="Help & Support"
          title="Help & Support"
          className="hidden sm:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>

        {/* Settings gear icon ⚙️ */}
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="hidden sm:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {/* Dark/Light mode theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="hidden sm:flex p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors animate-fade-in"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-300 fill-amber-300" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Notifications bell */}
        <NotificationsBell className="h-8 w-8 rounded-full bg-white/12 hover:bg-white/20 text-white flex items-center justify-center transition-colors" />

        <div className="h-4 w-px bg-white/20 mx-0.5" />

        {/* AI Assistant button */}
        <button
          onClick={onToggleAssistant}
          aria-label={assistantOpen ? "Close AI assistant" : "Open AI assistant"}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-[var(--primary)] bg-white hover:bg-white/90 transition-all ${
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

              {workspaces.length > 0 && (
                <div className="p-1 border-b border-slate-100">
                  <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspaces</p>
                  {switchError && <p className="px-3 pb-1.5 text-xs text-red-600">{switchError}</p>}
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => !ws.isActive && handleSwitchWorkspace(ws.id)}
                      disabled={switchingId !== null}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-left">{ws.name}</span>
                      {switchingId === ws.id ? (
                        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-slate-400" />
                      ) : ws.isActive ? (
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                      ) : null}
                    </button>
                  ))}
                  <button
                    onClick={() => { setOpen(false); setCreateOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4 text-slate-400" /> Create workspace
                  </button>
                </div>
              )}

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
                  onClick={() => { setOpen(false); setLogoutConfirmOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} size="sm">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center mb-5">
            <LogOut className="h-7 w-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Are You Sure You Want To Log Out?</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your data will be safe. Once you log in, you can view your data.
          </p>
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setLogoutConfirmOpen(false)}
              disabled={loggingOut}
              className="flex-1 py-2.5 rounded-full text-sm font-semibold border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-70"
            >
              {loggingOut ? "Logging out…" : "Log Out"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateError(null); }} title="Create workspace" description="Start a brand-new, separate company account. You'll need to set up billing for it separately." size="sm">
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Workspace name</label>
            <input
              type="text"
              autoFocus
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newWorkspaceName.trim() && !creating) handleCreateWorkspace(); }}
              placeholder="e.g. My Side Business"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setCreateOpen(false); setCreateError(null); }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateWorkspace}
              disabled={creating || !newWorkspaceName.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:opacity-90 disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create workspace
            </button>
          </div>
        </div>
      </Modal>
    </header>
  );
}
