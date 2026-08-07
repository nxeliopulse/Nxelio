"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  X, Send, Loader2, CheckCircle2, AlertCircle, History, SquarePen,
  ArrowLeft, Trash2, MessageSquare, Sparkles, Bell, Maximize2, Minimize2,
  Paperclip, Bookmark, BookmarkCheck, AtSign, Bot, ShieldAlert, Mic, MicOff,
  LayoutDashboard, Users, BarChart2, Settings, Inbox, Mail,
  FileText, Layers, Newspaper, Zap, ChevronRight,
} from "lucide-react";
import { runAssistant, approveAssistantActions, type AssistantMessage, type ProposedAction } from "@/lib/ai/assistant";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import {
  listAssistantChats, getAssistantChat, saveAssistantChat, deleteAssistantChat,
  type AssistantChatMeta,
} from "@/lib/ai/assistant-history";
import { formatRelative, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAssistant } from "@/components/layout/assistant-context";

interface ChatItem extends AssistantMessage {
  actions?: string[];
  error?: boolean;
  proposal?: ProposedAction[];
  proposalStatus?: "pending" | "processing" | "approved" | "failed" | "rejected";
  /** Fixed set of valid answers for this question — rendered as clickable options instead of free text. */
  choices?: string[];
}

// Minimal ambient types for the (still non-standard, vendor-prefixed) Web Speech API —
// mirrors the shape used by the landing page's voice input (src/components/landing/ai-assistant-widget.tsx).
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: { 0: SpeechRecognitionResultLike }[] }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

// Static fallback — replaced at runtime by dynamic suggestions from AssistantContext
const STATIC_SUGGESTIONS = [
  { Icon: BarChart2, text: "What's my workspace overview?" },
  { Icon: Users, text: "Show me my hot prospects" },
  { Icon: Mail, text: "Create a new email campaign" },
  { Icon: Settings, text: "List my team members and roles" },
];

const MENTION_ITEMS = [
  { label: "Prospects", Icon: Users, value: "leads" },
  { label: "Campaigns", Icon: Mail, value: "campaigns" },
  { label: "Segments", Icon: Layers, value: "segments" },
  { label: "Templates", Icon: FileText, value: "templates" },
  { label: "Newsletters", Icon: Newspaper, value: "newsletters" },
  { label: "Users", Icon: Users, value: "users" },
  { label: "Analytics", Icon: BarChart2, value: "analytics" },
  { label: "Inbox", Icon: Inbox, value: "inbox" },
];

const APP_NAV = [
  { label: "Dashboard", Icon: LayoutDashboard, href: "/dashboard" },
  { label: "Prospects", Icon: Users, href: "/leads" },
  { label: "Campaigns", Icon: Mail, href: "/campaigns" },
  { label: "Segments", Icon: Layers, href: "/segments" },
  { label: "Newsletters", Icon: Newspaper, href: "/newsletters" },
  { label: "Templates", Icon: FileText, href: "/templates" },
  { label: "Analytics", Icon: BarChart2, href: "/analytics" },
  { label: "Workflows", Icon: Zap, href: "/workflows" },
  { label: "Settings", Icon: Settings, href: "/settings" },
];

// Design tokens for light and dark themes
const TOKENS = {
  light: {
    panel: "#ffffff",
    panelBorder: "#CBD5E1",
    headerBorder: "#CBD5E1",
    msgAi: "#F8FAFC",
    msgAiBorder: "#CBD5E1",
    msgAiText: "#1E293B",
    msgErr: "#FEF2F2",
    msgErrBorder: "#FCA5A5",
    msgErrText: "#B91C1C",
    approvalBg: "#FFFBEB",
    approvalBorder: "#FCD34D",
    approvalText: "#92400E",
    inputBg: "#F8FAFC",
    inputBorder: "#94A3B8",
    dropdownBg: "#ffffff",
    dropdownBorder: "#CBD5E1",
    hoverBg: "#F1F5F9",
    suggBg: "#F8FAFC",
    suggBorder: "#CBD5E1",
    suggHoverBg: "var(--color-blue-50, #eff6ff)",
    suggHoverBorder: "var(--primary, #2563eb)",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",
    iconColor: "#64748B",
    appsPillBg: "var(--color-blue-50, #eff6ff)",
    appsPillBorder: "var(--color-blue-300, #93c5fd)",
    appsPillActiveBg: "var(--color-blue-100, #dbeafe)",
    appsPillActiveBorder: "var(--primary, #2563eb)",
    historyActiveBg: "#F1F5F9",
    historyHoverBg: "#F8FAFC",
  },
  dark: {
    panel: "#0F172A",
    panelBorder: "rgba(255,255,255,0.2)",
    headerBorder: "rgba(255,255,255,0.2)",
    msgAi: "#1E293B",
    msgAiBorder: "rgba(255,255,255,0.2)",
    msgAiText: "#f1f5f9",
    msgErr: "rgba(239,68,68,0.18)",
    msgErrBorder: "rgba(239,68,68,0.4)",
    msgErrText: "#fca5a5",
    approvalBg: "rgba(245,158,11,0.12)",
    approvalBorder: "rgba(245,158,11,0.4)",
    approvalText: "#fde68a",
    inputBg: "#1E293B",
    inputBorder: "rgba(255,255,255,0.25)",
    dropdownBg: "#1E293B",
    dropdownBorder: "rgba(255,255,255,0.2)",
    hoverBg: "rgba(255,255,255,0.08)",
    suggBg: "#1E293B",
    suggBorder: "rgba(255,255,255,0.1)",
    suggHoverBg: "rgba(255,255,255,0.12)",
    suggHoverBorder: "var(--primary, #3b82f6)",
    textPrimary: "#F8FAFC",
    textSecondary: "#94A3B8",
    textMuted: "#64748B",
    iconColor: "#94A3B8",
    appsPillBg: "rgba(255,255,255,0.08)",
    appsPillBorder: "rgba(255,255,255,0.15)",
    appsPillActiveBg: "rgba(255,255,255,0.15)",
    appsPillActiveBorder: "var(--primary, #3b82f6)",
    historyActiveBg: "rgba(255,255,255,0.1)",
    historyHoverBg: "rgba(255,255,255,0.06)",
  },
};

export function AssistantWidget({
  open = false,
  onClose,
  onExpandChange,
}: {
  open?: boolean;
  onClose?: () => void;
  onExpandChange?: (expanded: boolean) => void;
}) {
  const { suggestions: ctxSuggestions } = useAssistant();
  const activeSuggestions = ctxSuggestions.length > 0 ? ctxSuggestions : STATIC_SUGGESTIONS;

  const [view, setView] = useState<"chat" | "history" | "bookmarks">("chat");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<AssistantChatMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userName, setUserName] = useState("there");
  const [expanded, setExpanded] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [accentColors, setAccentColors] = useState({ primary: "#2563eb", purple: "#4f46e5" });
  const [pending, start] = useTransition();

  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [showApps, setShowApps] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [bookmarksList, setBookmarksList] = useState<{ content: string; date: string }[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Sync with app theme (.dark class and data-accent-color on <html>)
  useEffect(() => {
    const check = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
      const root = document.documentElement;
      const p = getComputedStyle(root).getPropertyValue("--primary").trim() || "#2563eb";
      const b600 = getComputedStyle(root).getPropertyValue("--color-blue-600").trim() || p;
      const b700 = getComputedStyle(root).getPropertyValue("--color-blue-700").trim() || p;
      setAccentColors({ primary: b600, purple: b700 });
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-accent-color"] });
    return () => observer.disconnect();
  }, []);

  const T = isDark ? TOKENS.dark : TOKENS.light;
  const PRIMARY = accentColors.primary;
  const PURPLE = accentColors.purple;
  const AMBER = "#d97706";

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "there";
      setUserName(name.split(" ")[0]);
    });
  }, []);

  // Stop any in-flight mic recording when the panel closes or unmounts.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- stops in-flight mic when the panel closes
      setListening(false);
    }
    return () => { recognitionRef.current?.stop(); };
  }, [open]);

  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view]);

  // Closing the panel (X button, Escape key, etc.) must also drop expanded
  // mode — otherwise the app shell's content stays hidden (blank screen)
  // since it only re-shows when assistantExpanded flips back to false.
  useEffect(() => {
    if (!open && expanded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets expanded mode when the panel closes by any path
      setExpanded(false);
      onExpandChange?.(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showMention) { setShowMention(false); return; }
        if (showApps) { setShowApps(false); return; }
        onClose?.();
      }
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, showMention, showApps]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) setShowMention(false);
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) setShowApps(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function newChat() {
    setChat([]); setChatId(null); setView("chat"); setInput(""); setAttachments([]);
  }

  function openHistory() {
    setView("history");
    setHistoryLoading(true);
    listAssistantChats().then(setHistoryList).catch(() => setHistoryList([])).finally(() => setHistoryLoading(false));
  }

  function loadChat(id: string) {
    setHistoryLoading(true);
    getAssistantChat(id).then((messages) => {
      if (messages) { setChat(messages); setChatId(id); setView("chat"); }
    }).finally(() => setHistoryLoading(false));
  }

  function removeChat(id: string) {
    setHistoryList((l) => l.filter((c) => c.id !== id));
    if (id === chatId) newChat();
    deleteAssistantChat(id).catch(() => {});
  }

  function persist(finalChat: ChatItem[]) {
    const toSave: AssistantMessage[] = finalChat.map(({ role, content }) => ({ role, content }));
    saveAssistantChat(chatId, toSave).then((id) => { if (id && !chatId) setChatId(id); }).catch(() => {});
  }

  function send(text?: string) {
    let message = (text ?? input).trim();
    if (!message && attachments.length === 0) return;
    if (pending) return;
    if (attachments.length > 0) {
      const fileNote = attachments.map((f) => `[File: ${f.name}]`).join(" ");
      message = message ? `${message}\n${fileNote}` : fileNote;
      setAttachments([]);
    }
    setInput(""); setShowMention(false);
    const nextChat: ChatItem[] = [...chat, { role: "user", content: message }];
    setChat(nextChat);
    start(async () => {
      const history: AssistantMessage[] = nextChat.map(({ role, content }) => ({ role, content }));
      const res = await runAssistant(history);
      if (res.error) { setChat((c) => [...c, { role: "assistant", content: res.error!, error: true }]); return; }
      const finalChat: ChatItem[] = [...nextChat, {
        role: "assistant", content: res.reply, actions: res.actions,
        ...(res.proposal?.length ? { proposal: res.proposal, proposalStatus: "pending" as const } : {}),
        ...(res.choices?.length ? { choices: res.choices } : {}),
      }];
      setChat(finalChat); persist(finalChat);
      notifyCreditsChanged();
    });
  }

  function approveProposal(index: number) {
    const item = chat[index];
    if (!item?.proposal || item.proposalStatus !== "pending" || pending) return;
    const proposal = item.proposal;
    // Mark "processing" (not "approved") until the actual result is known — the card must
    // never claim success before the write has actually completed.
    const processingChat = chat.map((m, i) => i === index ? { ...m, proposalStatus: "processing" as const } : m);
    setChat(processingChat);
    start(async () => {
      const res = await approveAssistantActions(proposal);
      const lines = [...res.results.map((r) => `✓ ${r}`), ...res.errors.map((e) => `✗ ${e}`)].join("\n");
      const finalStatus: ChatItem["proposalStatus"] = res.ok ? "approved" : "failed";
      const settledChat = processingChat.map((m, i) => i === index ? { ...m, proposalStatus: finalStatus } : m);
      const followUp: ChatItem = res.ok
        ? { role: "assistant", content: lines || "Approved — done.", actions: [] }
        : { role: "assistant", content: lines || "Some actions failed.", error: res.results.length === 0 };
      const next = [...settledChat, followUp];
      setChat(next); persist(next);
    });
  }

  function rejectProposal(index: number) {
    if (pending) return;
    const next = chat.map((m, i) => i === index ? { ...m, proposalStatus: "rejected" as const } : m) as ChatItem[];
    next.push({ role: "assistant", content: "Cancelled — nothing was changed." });
    setChat(next); persist(next);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    if (voiceError) setVoiceError(null);
    const match = val.match(/@(\w*)$/);
    if (match) { setMentionFilter(match[1].toLowerCase()); setShowMention(true); }
    else setShowMention(false);
  }

  function insertMention(value: string) {
    setInput((v) => v.replace(/@\w*$/, `@${value} `));
    setShowMention(false); inputRef.current?.focus();
  }

  function handleAtClick() {
    setInput((v) => v + "@"); setMentionFilter(""); setShowMention(true); inputRef.current?.focus();
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachments((prev) => [...prev, ...Array.from(e.target.files || [])]);
    e.target.value = "";
  }

  function bookmarkLast() {
    const last = [...chat].reverse().find((m) => m.role === "assistant" && !m.error);
    if (!last) return;
    try {
      const saved = JSON.parse(localStorage.getItem("nxl_bookmarks") || "[]");
      saved.unshift({ content: last.content, date: new Date().toISOString() });
      localStorage.setItem("nxl_bookmarks", JSON.stringify(saved.slice(0, 50)));
    } catch { /* ignore */ }
    setBookmarkSaved(true); setTimeout(() => setBookmarkSaved(false), 2000);
  }

  function openBookmarks() {
    setView("bookmarks");
    try {
      const saved = JSON.parse(localStorage.getItem("nxl_bookmarks") || "[]");
      setBookmarksList(Array.isArray(saved) ? saved : []);
    } catch {
      setBookmarksList([]);
    }
  }

  function removeBookmark(index: number) {
    setBookmarksList((list) => {
      const next = list.filter((_, i) => i !== index);
      try { localStorage.setItem("nxl_bookmarks", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Voice input — records into the text box for the user to review/edit, it never auto-sends.
  function toggleMic() {
    setVoiceError(null);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setVoiceError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      inputRef.current?.focus();
    };
    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
        setVoiceError("Microphone access was denied. Please allow microphone permission for this site and try again.");
      } else if (e.error === "no-speech") {
        setVoiceError("No speech detected — please try again.");
      } else if (e.error === "audio-capture") {
        setVoiceError("No microphone was found. Please connect one and try again.");
      } else if (e.error !== "aborted") {
        setVoiceError("Voice input failed. Please try again.");
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && showMention) { e.preventDefault(); setShowMention(false); return; }
    if (e.key === "Enter" && !e.shiftKey && !showMention) { e.preventDefault(); send(); }
  }

  const filteredMentions = MENTION_ITEMS.filter((m) => !mentionFilter || m.label.toLowerCase().startsWith(mentionFilter));
  const panelWidth = expanded ? "sm:flex-1" : "sm:w-[420px]";

  return (
    <aside
      className={cn(
        "flex overflow-hidden",
        "transition-[width,transform] duration-300 ease-in-out",
        "max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-50",
        open ? "max-sm:translate-x-0" : "max-sm:translate-x-full",
        "sm:sticky sm:top-0 sm:h-screen sm:translate-x-0",
        open ? panelWidth : "sm:w-0"
      )}
      role="complementary"
      aria-label="Nxelio Nurture AI assistant"
    >
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.docx,.xlsx" className="hidden" onChange={handleFiles} />

      {/* Gradient border wrapper */}
      <div
        className={cn(
          "flex flex-col mt-2.5 mb-2.5 rounded-2xl overflow-hidden h-[calc(100vh-20px)]",
          expanded ? "ml-2.5 mr-6 flex-1" : "ml-2.5 mr-2.5 flex-shrink-0 w-[396px]",
          "transition-[width,margin,flex] duration-300 ease-in-out",
          "max-sm:w-[calc(100vw-20px)] max-sm:h-[calc(100%-20px)]"
        )}
        style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PURPLE} 100%)`, padding: expanded ? "4px" : "3px" }}
      >
        {/* Inner panel */}
        <div className="flex flex-col h-full rounded-[13px] overflow-hidden" style={{ background: T.panel }}>

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ background: T.panel, borderColor: T.headerBorder }}>
            <div className="flex items-center gap-0.5">
              <IconBtn onClick={openHistory} title="Chat history" hoverBg={T.hoverBg} color={T.iconColor}><History className="h-4 w-4" /></IconBtn>
              <IconBtn title="Notifications" hoverBg={T.hoverBg} color={T.iconColor}><Bell className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={openBookmarks} title="Bookmarks" hoverBg={T.hoverBg} color={T.iconColor}><Bookmark className="h-4 w-4" /></IconBtn>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}>
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold tracking-wide" style={{ color: T.textPrimary }}>Assistant</span>
            </div>

            <div className="flex items-center gap-0.5">
              <IconBtn onClick={newChat} title="New chat" hoverBg={T.hoverBg} color={T.iconColor}><SquarePen className="h-4 w-4" /></IconBtn>
              <IconBtn
                onClick={() => { const next = !expanded; setExpanded(next); onExpandChange?.(next); }}
                title={expanded ? "Collapse" : "Expand"}
                hoverBg={T.hoverBg}
                color={T.iconColor}
                className="max-sm:hidden"
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </IconBtn>
              <IconBtn onClick={onClose} title="Close" hoverBg={T.hoverBg} color={T.iconColor}><X className="h-4 w-4" /></IconBtn>
            </div>
          </div>

          {/* ── History view ── */}
          {view === "history" && (
            <div className="flex flex-col flex-1 overflow-hidden" style={{ background: T.panel }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: T.panelBorder }}>
                <IconBtn onClick={() => setView("chat")} hoverBg={T.hoverBg} color={T.iconColor}><ArrowLeft className="h-4 w-4" /></IconBtn>
                <span className="text-sm font-medium" style={{ color: T.textPrimary }}>Chat history</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: PRIMARY }} />
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 mx-auto mb-3" style={{ color: PRIMARY, opacity: 0.4 }} />
                    <p className="text-sm" style={{ color: T.textSecondary }}>No past conversations yet.</p>
                  </div>
                ) : historyList.map((c) => (
                  <div key={c.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => loadChat(c.id)}
                      className="flex-1 min-w-0 text-left px-3 py-2.5 rounded-xl transition-colors"
                      style={{ background: c.id === chatId ? T.historyActiveBg : "transparent" }}
                      onMouseEnter={(e) => { if (c.id !== chatId) (e.currentTarget as HTMLButtonElement).style.background = T.historyHoverBg; }}
                      onMouseLeave={(e) => { if (c.id !== chatId) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      <p className="text-sm font-medium truncate" style={{ color: T.textPrimary }}>{c.title}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>{formatRelative(c.updated_at)}</p>
                    </button>
                    <button
                      onClick={() => removeChat(c.id)}
                      className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:text-red-400"
                      style={{ color: T.textMuted }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Bookmarks view ── */}
          {view === "bookmarks" && (
            <div className="flex flex-col flex-1 overflow-hidden" style={{ background: T.panel }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: T.panelBorder }}>
                <IconBtn onClick={() => setView("chat")} hoverBg={T.hoverBg} color={T.iconColor}><ArrowLeft className="h-4 w-4" /></IconBtn>
                <span className="text-sm font-medium" style={{ color: T.textPrimary }}>Bookmarks</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {bookmarksList.length === 0 ? (
                  <div className="text-center py-12">
                    <Bookmark className="h-8 w-8 mx-auto mb-3" style={{ color: PRIMARY, opacity: 0.4 }} />
                    <p className="text-sm" style={{ color: T.textSecondary }}>No bookmarks yet.</p>
                    <p className="text-xs mt-1 max-w-[220px] mx-auto" style={{ color: T.textMuted }}>
                      Tap the bookmark icon under a reply to save it here.
                    </p>
                  </div>
                ) : bookmarksList.map((b, i) => (
                  <div key={i} className="group rounded-xl px-3 py-2.5 border" style={{ borderColor: T.panelBorder, background: T.msgAi }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm whitespace-pre-wrap line-clamp-4 flex-1 min-w-0" style={{ color: T.textPrimary }}>{b.content}</p>
                      <button
                        onClick={() => removeBookmark(i)}
                        className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:text-red-400 flex-shrink-0"
                        style={{ color: T.textMuted }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] mt-1.5" style={{ color: T.textMuted }}>{formatRelative(b.date)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Chat view ── */}
          {view === "chat" && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ background: T.panel }}>
                {chat.length === 0 ? (
                  <div className={cn("flex flex-col items-center justify-center h-full px-6 py-8 text-center", expanded && "mx-auto w-full max-w-xl")}>
                    <div className={cn("rounded-2xl flex items-center justify-center mb-5 shadow-md", expanded ? "h-20 w-20" : "h-16 w-16")} style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PURPLE} 100%)` }}>
                      <Bot className={cn(expanded ? "h-10 w-10" : "h-8 w-8", "text-white")} />
                    </div>
                    <h2 className={cn("font-bold mb-1.5", expanded ? "text-4xl" : "text-2xl")} style={{ color: T.textPrimary }}>Hi {userName}!</h2>
                    <p className={cn("font-medium mb-1", expanded ? "text-xl" : "text-base")} style={{ color: PRIMARY }}>How can I help you?</p>
                    <p className={cn("mb-8", expanded ? "text-sm max-w-sm" : "text-xs max-w-[240px]")} style={{ color: T.textSecondary }}>
                      Ask me anything about your Nxelio Nurture workspace — prospects, campaigns, analytics, and more.
                    </p>
                    <div className="w-full space-y-2">
                      {activeSuggestions.map((s) => (
                        <button
                          key={s.text}
                          onClick={() => send(s.text)}
                          className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all"
                          style={{ borderColor: T.suggBorder, background: T.suggBg }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = T.suggHoverBorder;
                            (e.currentTarget as HTMLButtonElement).style.background = T.suggHoverBg;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = T.suggBorder;
                            (e.currentTarget as HTMLButtonElement).style.background = T.suggBg;
                          }}
                        >
                          <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}>
                            <s.Icon className="h-3.5 w-3.5 text-white" strokeWidth={2} />
                          </span>
                          <span className="text-sm" style={{ color: T.textPrimary }}>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {chat.map((m, i) => (
                      <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                        {m.role === "assistant" && (
                          <div className="h-6 w-6 rounded-lg flex-shrink-0 mt-0.5 mr-2 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}>
                            <Sparkles className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div
                          className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed", m.role === "user" ? "rounded-br-sm" : "rounded-bl-sm")}
                          style={
                            m.role === "user"
                              ? { background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})`, color: "#ffffff" }
                              : m.error
                                ? { background: T.msgErr, border: `1.5px solid ${T.msgErrBorder}`, color: T.msgErrText }
                                : { background: T.msgAi, border: `1.5px solid ${T.msgAiBorder}`, color: T.msgAiText }
                          }
                        >
                          {m.error && <AlertCircle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" style={{ color: T.msgErrText }} />}
                          {m.content}

                          {m.actions && m.actions.length > 0 && (
                            <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${T.msgAiBorder}` }}>
                              {m.actions.map((a, j) => (
                                <p key={j} className="flex items-center gap-1.5 text-xs" style={{ color: PRIMARY }}>
                                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> {a}
                                </p>
                              ))}
                            </div>
                          )}

                          {m.choices && m.choices.length > 0 && i === chat.length - 1 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {m.choices.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => send(c)}
                                  disabled={pending}
                                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50"
                                  style={{ borderColor: T.suggBorder, background: T.suggBg, color: T.textPrimary }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.suggHoverBorder;
                                    (e.currentTarget as HTMLButtonElement).style.background = T.suggHoverBg;
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.suggBorder;
                                    (e.currentTarget as HTMLButtonElement).style.background = T.suggBg;
                                  }}
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          )}

                          {m.proposal && (
                            <div className="mt-3 rounded-xl p-3 border" style={{ background: T.approvalBg, borderColor: T.approvalBorder }}>
                              <div className="flex items-center gap-1.5 mb-2">
                                <ShieldAlert className="h-3.5 w-3.5" style={{ color: AMBER }} />
                                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: AMBER }}>Approval Required</p>
                              </div>
                              <ul className="space-y-1.5 mb-3">
                                {m.proposal.map((a, j) => (
                                  <li key={j} className="text-xs flex items-start gap-2" style={{ color: T.approvalText }}>
                                    <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: AMBER }} />
                                    {a.summary}
                                  </li>
                                ))}
                              </ul>
                              {m.proposalStatus === "pending" ? (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => approveProposal(i)}
                                    disabled={pending}
                                    className="flex-1 rounded-lg text-white text-xs font-semibold py-1.5 transition-opacity disabled:opacity-50 hover:opacity-90"
                                    style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}
                                  >
                                    Approve &amp; run
                                  </button>
                                  <button
                                    onClick={() => rejectProposal(i)}
                                    disabled={pending}
                                    className="flex-1 rounded-lg text-xs font-semibold py-1.5 border transition-colors disabled:opacity-50"
                                    style={{ color: T.textSecondary, borderColor: T.panelBorder, background: "transparent" }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : m.proposalStatus === "processing" ? (
                                <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                                </p>
                              ) : (
                                <p className={cn("text-xs font-semibold", m.proposalStatus === "approved" ? "text-emerald-500" : "text-red-500")}>
                                  {m.proposalStatus === "approved" ? "✓ Approved" : m.proposalStatus === "failed" ? "✗ Failed — see message below" : "✗ Rejected"}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {pending && (
                      <div className="flex justify-start items-center gap-2">
                        <div className="h-6 w-6 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}>
                          <Sparkles className="h-3 w-3 text-white" />
                        </div>
                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5" style={{ background: T.msgAi, border: `1px solid ${T.msgAiBorder}` }}>
                          {[0, 1, 2].map((d) => (
                            <span key={d} className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: PRIMARY, animationDelay: `${d * 150}ms`, animationDuration: "0.8s" }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Input area ── */}
              <div className={cn("p-3 pt-2 border-t", expanded && "pb-6")} style={{ background: T.panel, borderColor: T.headerBorder }}>
                <div className={cn("relative", expanded && "mx-auto w-full max-w-2xl")}>

                  {/* @ Mention dropdown */}
                  {showMention && filteredMentions.length > 0 && (
                    <div ref={mentionRef} className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden shadow-lg z-20 border" style={{ background: T.dropdownBg, borderColor: T.dropdownBorder }}>
                      <div className="px-3 py-2 border-b" style={{ borderColor: T.panelBorder }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>Mention a module</p>
                      </div>
                      <div className="py-1 max-h-48 overflow-y-auto">
                        {filteredMentions.map((item) => (
                          <button
                            key={item.value}
                            onMouseDown={(e) => { e.preventDefault(); insertMention(item.value); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                            style={{ color: T.textPrimary }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = T.hoverBg}
                            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
                          >
                            <span className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}>
                              <item.Icon className="h-3 w-3 text-white" strokeWidth={2} />
                            </span>
                            <span className="text-sm">{item.label}</span>
                            <ChevronRight className="h-3.5 w-3.5 ml-auto" style={{ color: T.textMuted }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* NXL Apps panel */}
                  {showApps && (
                    <div ref={appsRef} className="absolute bottom-full mb-2 left-0 w-56 rounded-xl overflow-hidden shadow-lg z-20 border" style={{ background: T.dropdownBg, borderColor: isDark ? "rgba(37,99,235,0.4)" : T.panelBorder }}>
                      <div className="px-3 py-2 border-b" style={{ borderColor: T.panelBorder }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PURPLE }}>Quick Navigate</p>
                      </div>
                      <div className="py-1">
                        {APP_NAV.map(({ label, Icon, href }) => (
                          <a
                            key={href}
                            href={href}
                            onClick={() => setShowApps(false)}
                            className="flex items-center gap-3 px-3 py-2 text-sm transition-colors"
                            style={{ color: T.textPrimary }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLAnchorElement).style.background = T.hoverBg}
                            onMouseLeave={(e) => (e.currentTarget as HTMLAnchorElement).style.background = "transparent"}
                          >
                            <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: PURPLE }} />
                            {label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attachment chips */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {attachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border" style={{ background: isDark ? "rgba(37,99,235,0.12)" : "#eff6ff", borderColor: isDark ? "rgba(37,99,235,0.3)" : "#bfdbfe", color: T.textPrimary }}>
                          <Paperclip className="h-3 w-3 flex-shrink-0" style={{ color: PRIMARY }} />
                          <span className="max-w-[100px] truncate">{f.name}</span>
                          <button onMouseDown={(e) => { e.preventDefault(); setAttachments((p) => p.filter((_, idx) => idx !== i)); }} className="ml-0.5 hover:text-red-400 transition-colors" style={{ color: T.textMuted }}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Voice input error */}
                  {voiceError && (
                    <div className="flex items-start gap-1.5 mb-2 px-3 py-2 rounded-lg text-xs" style={{ background: T.msgErr, border: `1px solid ${T.msgErrBorder}`, color: T.msgErrText }}>
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span className="flex-1">{voiceError}</span>
                      <button onClick={() => setVoiceError(null)} className="flex-shrink-0 opacity-70 hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Textarea box */}
                  <div className="relative rounded-2xl transition-all" style={{ border: `2px solid ${T.inputBorder}`, background: T.inputBg }}>
                    <textarea
                      ref={inputRef}
                      rows={3}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKey}
                      placeholder={listening ? "Listening…" : "Type @ to mention a record"}
                      disabled={pending}
                      className="w-full resize-none rounded-2xl px-4 pt-3 pb-12 text-sm focus:outline-none bg-transparent placeholder:text-slate-400"
                      style={{ color: T.textPrimary }}
                      onFocus={(e) => {
                        (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = PRIMARY;
                        (e.currentTarget.parentElement as HTMLDivElement).style.boxShadow = "0 0 0 3px rgba(31,168,184,0.12)";
                      }}
                      onBlur={(e) => {
                        (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = T.inputBorder;
                        (e.currentTarget.parentElement as HTMLDivElement).style.boxShadow = "none";
                      }}
                    />

                    {/* Bottom toolbar */}
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {/* Apps pill */}
                        <button
                          type="button"
                          onClick={() => setShowApps((v) => !v)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all"
                          style={{ borderColor: showApps ? T.appsPillActiveBorder : T.appsPillBorder, background: showApps ? T.appsPillActiveBg : T.appsPillBg }}
                        >
                          <span className="flex gap-px text-[9px] font-black leading-none">
                            <span style={{ color: PRIMARY }}>N</span>
                            <span style={{ color: PURPLE }}>X</span>
                            <span style={{ color: PRIMARY }}>L</span>
                          </span>
                          <span className="text-xs font-medium" style={{ color: T.textSecondary }}>Apps</span>
                        </button>

                        <IconBtn title="Attach file" onClick={() => fileInputRef.current?.click()} hoverBg={T.hoverBg} color={attachments.length > 0 ? PRIMARY : T.iconColor}>
                          <Paperclip className="h-3.5 w-3.5" />
                        </IconBtn>

                        <IconBtn
                          title={bookmarkSaved ? "Saved!" : "Bookmark last reply"}
                          onClick={bookmarkLast}
                          disabled={!chat.some((m) => m.role === "assistant" && !m.error)}
                          hoverBg={T.hoverBg}
                          color={bookmarkSaved ? AMBER : T.iconColor}
                        >
                          {bookmarkSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                        </IconBtn>

                        <IconBtn title="Mention a module" onClick={handleAtClick} hoverBg={T.hoverBg} color={showMention ? PRIMARY : T.iconColor}>
                          <AtSign className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>

                      {/* Mic + Send button — mic sits immediately before send */}
                      <div className="flex items-center gap-1.5">
                        <IconBtn
                          title={listening ? "Listening… tap to stop" : "Voice input"}
                          onClick={toggleMic}
                          hoverBg={T.hoverBg}
                          color={listening ? "#ef4444" : T.iconColor}
                          className={listening ? "animate-pulse" : undefined}
                        >
                          {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <button
                          onClick={() => send()}
                          disabled={pending || (!input.trim() && attachments.length === 0)}
                          aria-label="Send"
                          className="h-7 w-7 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30 hover:opacity-85 shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PURPLE})` }}
                        >
                          {pending ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Send className="h-3.5 w-3.5 text-white" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-center mt-2" style={{ color: T.textMuted }}>
                  AI-generated content may be inaccurate. Verify important actions before approving.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

// Small helper to avoid repetitive button markup
function IconBtn({
  children, onClick, title, hoverBg, color, disabled, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  hoverBg: string;
  color: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn("p-1.5 rounded-lg transition-colors disabled:opacity-30", className)}
      style={{ color }}
      onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = hoverBg}
      onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
    >
      {children}
    </button>
  );
}
