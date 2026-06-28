"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle, History, SquarePen, ArrowLeft, Trash2, MessageSquare, BarChart2, UserPlus, Search, HelpCircle } from "lucide-react";
import { runAssistant, approveAssistantActions, type AssistantMessage, type ProposedAction } from "@/lib/ai/assistant";
import {
  listAssistantChats, getAssistantChat, saveAssistantChat, deleteAssistantChat,
  type AssistantChatMeta,
} from "@/lib/ai/assistant-history";
import { LogoMark } from "@/components/brand/logo";
import { formatRelative, cn } from "@/lib/utils";

interface ChatItem extends AssistantMessage {
  actions?: string[];
  error?: boolean;
  proposal?: ProposedAction[];
  proposalStatus?: "pending" | "approved" | "rejected";
}

const QUICK_ACTIONS = [
  { label: "Summarize", icon: BarChart2, prompt: "Give me a summary of my workspace stats — leads, campaigns, and key metrics." },
  { label: "Add Lead", icon: UserPlus, prompt: "Add a lead" },
  { label: "Search Leads", icon: Search, prompt: "Search leads" },
  { label: "How do I", icon: HelpCircle, prompt: "What can you help me do in LeadPro?" },
];

export function AssistantWidget({
  open,
  onClose,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  userName?: string;
}) {
  const [view, setView] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<AssistantChatMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const firstName = userName?.split(" ")[0] || "there";

  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function newChat() {
    setChat([]);
    setChatId(null);
    setView("chat");
    setInput("");
  }

  function openHistory() {
    setView("history");
    setHistoryLoading(true);
    listAssistantChats()
      .then(setHistoryList)
      .catch(() => setHistoryList([]))
      .finally(() => setHistoryLoading(false));
  }

  function loadChat(id: string) {
    setHistoryLoading(true);
    getAssistantChat(id)
      .then((messages) => {
        if (messages) {
          setChat(messages);
          setChatId(id);
          setView("chat");
        }
      })
      .finally(() => setHistoryLoading(false));
  }

  function removeChat(id: string) {
    setHistoryList((l) => l.filter((c) => c.id !== id));
    if (id === chatId) newChat();
    deleteAssistantChat(id).catch(() => {});
  }

  function persist(finalChat: ChatItem[]) {
    const toSave: AssistantMessage[] = finalChat.map(({ role, content }) => ({ role, content }));
    saveAssistantChat(chatId, toSave)
      .then((id) => { if (id && !chatId) setChatId(id); })
      .catch(() => {});
  }

  function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    const nextChat: ChatItem[] = [...chat, { role: "user", content: message }];
    setChat(nextChat);
    start(async () => {
      const history: AssistantMessage[] = nextChat.map(({ role, content }) => ({ role, content }));
      const res = await runAssistant(history);
      if (res.error) {
        setChat((c) => [...c, { role: "assistant", content: res.error!, error: true }]);
        return;
      }
      const finalChat: ChatItem[] = [...nextChat, {
        role: "assistant",
        content: res.reply,
        actions: res.actions,
        ...(res.proposal?.length ? { proposal: res.proposal, proposalStatus: "pending" as const } : {}),
      }];
      setChat(finalChat);
      persist(finalChat);
    });
  }

  function approveProposal(index: number) {
    const item = chat[index];
    if (!item?.proposal || item.proposalStatus !== "pending" || pending) return;
    const proposal = item.proposal;
    const approvedChat: ChatItem[] = chat.map((m, i) =>
      i === index ? { ...m, proposalStatus: "approved" as const } : m
    );
    setChat(approvedChat);
    start(async () => {
      const res = await approveAssistantActions(proposal);
      const lines = [
        ...res.results.map((r) => `✓ ${r}`),
        ...res.errors.map((e) => `✗ ${e}`),
      ].join("\n");
      const followUp: ChatItem = res.ok
        ? { role: "assistant", content: lines || "Approved — done.", actions: [] }
        : { role: "assistant", content: lines || "Some actions failed.", error: res.results.length === 0 };
      const next = [...approvedChat, followUp];
      setChat(next);
      persist(next);
    });
  }

  function rejectProposal(index: number) {
    if (pending) return;
    const next: ChatItem[] = chat.map((m, i) =>
      i === index ? { ...m, proposalStatus: "rejected" as const } : m
    );
    next.push({ role: "assistant", content: "Cancelled — nothing was changed." });
    setChat(next);
    persist(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const hasChat = chat.length > 0;

  return (
    <aside
      className={cn(
        "bg-white flex overflow-hidden",
        "transition-[width,transform] duration-300 ease-in-out",
        "max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-50 max-sm:w-[400px] max-sm:max-w-full max-sm:shadow-2xl",
        open ? "max-sm:translate-x-0" : "max-sm:translate-x-full",
        "sm:sticky sm:top-0 sm:h-screen sm:translate-x-0",
        open ? "sm:w-[400px] sm:shadow-[-8px_0_24px_-4px_rgba(0,0,0,0.08)]" : "sm:w-0"
      )}
      role="complementary"
      aria-label="LeadPro AI assistant"
    >
      <div className="flex flex-col h-screen w-[400px] max-sm:w-full flex-shrink-0">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {view === "history" ? (
              <button
                onClick={() => setView("chat")}
                aria-label="Back to chat"
                className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
            ) : (
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <LogoMark className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="font-semibold text-sm text-slate-800">
              {view === "history" ? "Chat history" : "LeadPro Assistant"}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            {view === "chat" && (
              <>
                <button
                  onClick={newChat}
                  aria-label="New chat"
                  title="New chat"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <SquarePen className="h-4 w-4" />
                </button>
                <button
                  onClick={openHistory}
                  aria-label="Chat history"
                  title="Chat history"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <History className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close assistant"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* History view */}
        {view === "history" && (
          <div className="flex-1 overflow-y-auto p-3">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No past chats yet.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {historyList.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => loadChat(c.id)}
                      className={cn(
                        "flex-1 min-w-0 text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors",
                        c.id === chatId && "bg-blue-50"
                      )}
                    >
                      <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{formatRelative(c.updated_at)}</p>
                    </button>
                    <button
                      onClick={() => removeChat(c.id)}
                      aria-label={`Delete chat: ${c.title}`}
                      className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Chat view */}
        {view === "chat" && (
          <>
            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {!hasChat ? (
                /* Empty / greeting state */
                <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                  <p className="text-2xl font-bold text-blue-600 leading-snug">
                    Hi {firstName},
                  </p>
                  <p className="text-2xl font-bold text-slate-800 leading-snug mb-8">
                    how can I help you?
                  </p>
                  <p className="text-xs text-slate-400 mb-1">AI-generated content may be inaccurate.</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {chat.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      {m.role === "assistant" && (
                        <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                          <LogoMark className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : m.error
                            ? "bg-red-50 text-red-700 border border-red-100 rounded-bl-sm"
                            : "bg-slate-100 text-slate-800 rounded-bl-sm"
                      )}>
                        {m.error && <AlertCircle className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />}
                        {m.content}

                        {m.actions && m.actions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                            {m.actions.map((a, j) => (
                              <p key={j} className="flex items-center gap-1.5 text-xs text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> {a}
                              </p>
                            ))}
                          </div>
                        )}

                        {m.proposal && (
                          <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1.5">
                              Approval required
                            </p>
                            <ul className="space-y-1 mb-2.5">
                              {m.proposal.map((a, j) => (
                                <li key={j} className="text-xs text-amber-900 flex items-start gap-1.5">
                                  <span className="mt-1 h-1 w-1 rounded-full bg-amber-500 flex-shrink-0" />
                                  {a.summary}
                                </li>
                              ))}
                            </ul>
                            {m.proposalStatus === "pending" ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => approveProposal(i)}
                                  disabled={pending}
                                  className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                  Approve &amp; run
                                </button>
                                <button
                                  onClick={() => rejectProposal(i)}
                                  disabled={pending}
                                  className="flex-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-semibold py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <p className={cn(
                                "text-xs font-semibold",
                                m.proposalStatus === "approved" ? "text-emerald-700" : "text-slate-400"
                              )}>
                                {m.proposalStatus === "approved" ? "✓ Approved" : "✗ Cancelled"}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {pending && (
                    <div className="flex justify-start items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <LogoMark className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 inline-flex items-center gap-2">
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-slate-100 px-3 pt-3 pb-3 space-y-2">
              {/* Quick action chips — only show when no chat yet */}
              {!hasChat && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
                    <button
                      key={label}
                      onClick={() => send(prompt)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                    >
                      <Icon className="h-3 w-3 text-slate-400" />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Textarea + send */}
              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything…"
                  rows={1}
                  disabled={pending}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none min-h-[24px] max-h-[120px] leading-6"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="Send"
                  className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center disabled:opacity-30 hover:bg-blue-700 transition-colors flex-shrink-0 mb-0.5"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>

              <p className="text-[10px] text-slate-400 text-center">
                AI can read, add &amp; update workspace data. Changes require your approval.
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
