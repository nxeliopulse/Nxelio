"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart2, Users, Mail, TrendingUp, Settings, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getContextualAssistantProfile, type ContextualPageId, type ContextualSuggestionIcon } from "@/lib/ai/contextual";

export interface AISuggestion {
  Icon: LucideIcon;
  text: string;
}

function iconForSuggestion(icon: ContextualSuggestionIcon): LucideIcon {
  const icons: Record<ContextualSuggestionIcon, LucideIcon> = {
    users: Users,
    mail: Mail,
    "trending-up": TrendingUp,
    "bar-chart": BarChart2,
    settings: Settings,
    sparkles: Sparkles,
  };
  return icons[icon];
}

export const DEFAULT_SUGGESTIONS: AISuggestion[] = getContextualAssistantProfile("/dashboard").suggestions.map((suggestion) => ({
  Icon: iconForSuggestion(suggestion.icon),
  text: suggestion.text,
}));

interface AssistantCtx {
  toggle: () => void;
  suggestions: AISuggestion[];
  setSuggestions: (s: AISuggestion[]) => void;
  pageContext: AssistantPageContext;
}

export interface AssistantPageContext {
  pathname: string;
  label: string;
  profileId: ContextualPageId;
}

function labelForPath(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    leads: "Prospects",
    accounts: "Accounts",
    contacts: "Contacts",
    campaigns: "Campaigns",
    segments: "Segments",
    opportunities: "Opportunities",
    activities: "Activities",
    meetings: "Meetings",
    newsletters: "Newsletters",
    analytics: "Analytics",
    users: "Administration",
    billing: "Billing",
    settings: "Settings",
  };
  return labels[first] || first.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const AssistantContext = createContext<AssistantCtx>({
  toggle: () => {},
  suggestions: DEFAULT_SUGGESTIONS,
  setSuggestions: () => {},
  pageContext: { pathname: "/dashboard", label: "Dashboard", profileId: "dashboard" },
});

export function AssistantProvider({
  children,
  toggle,
}: {
  children: React.ReactNode;
  toggle: () => void;
}) {
  const [customSuggestions, setCustomSuggestions] = useState<{ pathname: string; items: AISuggestion[] } | null>(null);
  const pathname = usePathname() || "/dashboard";
  const profile = getContextualAssistantProfile(pathname);
  const profileSuggestions = useMemo(
    () => profile.suggestions.map((suggestion) => ({ Icon: iconForSuggestion(suggestion.icon), text: suggestion.text })),
    [profile],
  );
  const suggestions = customSuggestions?.pathname === pathname ? customSuggestions.items : profileSuggestions;
  const setSuggestions = (items: AISuggestion[]) => setCustomSuggestions({ pathname, items });
  const pageContext = { pathname, label: labelForPath(pathname), profileId: profile.id };
  return (
    <AssistantContext.Provider value={{ toggle, suggestions, setSuggestions, pageContext }}>
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
