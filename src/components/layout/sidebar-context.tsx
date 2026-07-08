"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface SidebarCtx {
  /** Mobile drawer open/closed */
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  toggleMobile: () => void;
  /** Desktop collapsed (icon-only) state, persisted to localStorage */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
}

const Ctx = createContext<SidebarCtx | null>(null);
const STORAGE_KEY = "lp-sidebar-collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  // Restore the persisted collapse preference on mount
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsedState(true);
    } catch {}
  }, []);

  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch {}
  }

  return (
    <Ctx.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggleMobile: () => setMobileOpen(!mobileOpen),
        collapsed,
        setCollapsed,
        toggleCollapsed: () => setCollapsed(!collapsed),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSidebar must be used inside SidebarProvider");
  return v;
}
