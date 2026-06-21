"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle, Bot, History, SquarePen, ArrowLeft, Trash2, MessageSquare } from "lucide-react";
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
  /** Pending write actions awaiting admin approval */
  proposal?: ProposedAction[];
  proposalStatus?: "pending" | "approved" | "rejected";
}

const SUGGESTIONS = [
  "How many hot leads do I have?",
  "Add a lead: Priya, priya@acme.com, Acme Corp",
  "Create a segment for Healthcare leads",
  "Draft a campaign to book demo meetings",
];

export function AssistantWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<AssistantChatMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      .catch(() => { /* history is best-effort; the chat itself already succeeded */ });
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
    // Compute next states outside setChat — calling a server action inside a
    // state-updater runs it during render and trips React's Router warning.
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

  return (
    <>
      {/* Side panel — always mounted so it animates. On desktop it shares the
          window (animated width column, content shrinks); on phones it slides
          in as an overlay. Width/transform transitions = smooth open/close. */}
      <aside
        className={cn(
          "bg-white border-slate-200 flex overflow-hidden",
          "transition-[width,transform] duration-300 ease-in-out",
          // phone: fixed overlay sliding from the right
          "max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-50 max-sm:w-[400px] max-sm:max-w-full max-sm:border-l max-sm:shadow-2xl",
          open ? "max-sm:translate-x-0" : "max-sm:translate-x-full",
          // desktop: sticky column whose width animates 0 ↔ 400px
          "sm:sticky sm:top-0 sm:h-screen sm:translate-x-0",
          open ? "sm:w-[400px] sm:border-l" : "sm:w-0"
        )}
        role="complementary"
        aria-label="LeadPro AI assistant"
      >
        {/* Fixed-width inner so content never reflows — the outer just clips it */}
        <div className="flex flex-col h-screen w-[400px] max-sm:w-full flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2.5">
            {view === "history" ? (
              <button onClick={() => setView("chat")} aria-label="Back to chat" className="p-1.5 -ml-1.5 rounded-md hover:bg-white/15">
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                <LogoMark className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="leading-tight">
              <p className="font-semibold text-sm">{view === "history" ? "Chat history" : "LeadPro AI"}</p>
              {view === "chat" && <p className="text-[11px] text-blue-100">Tell me what to do — I&apos;ll do it</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === "chat" && (
              <>
                <button onClick={newChat} aria-label="New chat" title="New chat" className="p-1.5 rounded-md hover:bg-white/15">
                  <SquarePen className="h-4.5 w-4.5" />
                </button>
                <button onClick={openHistory} aria-label="Chat history" title="Chat history" className="p-1.5 rounded-md hover:bg-white/15">
                  <History className="h-4.5 w-4.5" />
                </button>
              </>
            )}
            <button onClick={onClose} aria-label="Close assistant" className="p-1.5 rounded-md hover:bg-white/15">
              <X className="h-5 w-5" />
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
              <div className="text-center py-12">
                <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No past chats yet.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {historyList.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => loadChat(c.id)}
                      className={`flex-1 min-w-0 text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors ${c.id === chatId ? "bg-blue-50 dark:bg-blue-500/15" : ""}`}
                    >
                      <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{formatRelative(c.updated_at)}</p>
                    </button>
                    <button
                      onClick={() => removeChat(c.id)}
                      aria-label={`Delete chat: ${c.title}`}
                      className="p-2 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
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
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {chat.length === 0 && (
                <div className="pt-6">
                  <div className="h-12 w-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
                    <Bot className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="text-center text-sm font-medium text-slate-900">Hi! I can work this app for you.</p>
                  <p className="text-center text-xs text-slate-500 mt-1 mb-5">Create leads, segments, campaigns, templates, send emails, or answer questions about your data.</p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : m.error
                        ? "bg-red-50 text-red-700 border border-red-200 rounded-bl-sm"
                        : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  }`}>
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

                    {/* Admin approval card for pending write actions */}
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
                              className="flex-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Approve &amp; run
                            </button>
                            <button
                              onClick={() => rejectProposal(i)}
                              disabled={pending}
                              className="flex-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-semibold py-1.5 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <p className={`text-xs font-semibold ${m.proposalStatus === "approved" ? "text-emerald-700" : "text-slate-500"}`}>
                            {m.proposalStatus === "approved" ? "✓ Approved" : "✗ Rejected"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-slate-500 inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working on it…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100">
              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask or instruct… e.g. “mark Sundhar as Hot”"
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  disabled={pending}
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="Send"
                  className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">AI can create &amp; edit workspace data. Emails send only after you confirm.</p>
            </div>
          </>
        )}
        </div>
      </aside>
    </>
  );
}
