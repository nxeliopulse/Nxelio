"use client";
import { createContext, useContext, useState } from "react";
import { BarChart2, Users, Mail, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AISuggestion {
  Icon: LucideIcon;
  text: string;
}

export const DEFAULT_SUGGESTIONS: AISuggestion[] = [
  { Icon: BarChart2, text: "What's my workspace overview?" },
  { Icon: Users,    text: "Show me my hot leads" },
  { Icon: Mail,     text: "Create a new email campaign" },
  { Icon: TrendingUp, text: "How are my campaigns performing?" },
];

interface AssistantCtx {
  toggle: () => void;
  suggestions: AISuggestion[];
  setSuggestions: (s: AISuggestion[]) => void;
}

const AssistantContext = createContext<AssistantCtx>({
  toggle: () => {},
  suggestions: DEFAULT_SUGGESTIONS,
  setSuggestions: () => {},
});

export function AssistantProvider({
  children,
  toggle,
}: {
  children: React.ReactNode;
  toggle: () => void;
}) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(DEFAULT_SUGGESTIONS);
  return (
    <AssistantContext.Provider value={{ toggle, suggestions, setSuggestions }}>
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
