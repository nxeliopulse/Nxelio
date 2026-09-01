"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Loader2, ChevronRight, ArrowLeft, Search, MessageSquare } from "lucide-react";
import { runSupport, type SupportMessage, type SupportLink } from "@/lib/ai/support";
import { LogoMark } from "@/components/brand/logo";

interface ChatItem extends SupportMessage {
  links?: SupportLink[];
}

/** Quick-choice topics shown on the support home screen. */
const SUPPORT_TOPICS: { label: string; question: string }[] = [
  { label: "How do I add leads?", question: "How do I add leads to my workspace?" },
  { label: "Campaigns vs Sequences", question: "What's the difference between Campaigns and Sequences?" },
  { label: "Send a newsletter", question: "How do I create and send a newsletter?" },
  { label: "Invite a teammate", question: "How do I invite a teammate and set their permissions?" },
  { label: "Connect email / sending", question: "How does email sending work and do I need a domain?" },
  { label: "Take me to a page", question: "Help me navigate the app." },
];

export function SupportWidget({ assistantOpen = false, assistantExpanded = false }: { assistantOpen?: boolean; assistantExpanded?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"home" | "chat">("home");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function ask(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    setView("chat");
    const next: ChatItem[] = [...chat, { role: "user", content: message }];
    setChat(next);
    start(async () => {
      const res = await runSupport(next.map(({ role, content }) => ({ role, content })));
      setChat((c) => [...c, { role: "assistant", content: res.error || res.reply, links: res.links }]);
    });
  }

  function goTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  function newChat() {
    setChat([]);
    setView("home");
    setInput("");
  }

  return (
    <>
      {/* Floating panel — Intercom/Dripify-style card anchored bottom-right */}
      {open && (
        <div className={`fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-24 z-50 w-full sm:w-[384px] sm:max-w-[92vw] transition-[right] duration-300 ease-in-out ${assistantOpen ? "sm:right-[424px]" : "sm:right-6"}`}>
          <div className="lp-anim-pop origin-bottom sm:origin-bottom-right bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[78vh] sm:max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="bg-[var(--primary)] text-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {view === "chat" && (
                    <button onClick={newChat} aria-label="Back" className="p-1 -ml-1 rounded-md hover:bg-white/15">
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                  <div className="h-8 w-8 rounded-lg overflow-hidden bg-white flex items-center justify-center">
                    <LogoMark className="h-full w-full" />
                  </div>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close support" className="p-1 rounded-md hover:bg-white/15">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <h2 className="mt-3 text-xl font-bold">Hi there 👋</h2>
              <p className="text-white/80 text-sm">How can we help you use Nxelio Nurture?</p>
            </div>

            {/* Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {view === "home" ? (
                <>
                  <button
                    onClick={() => { setView("chat"); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left shadow-sm hover:border-[var(--primary)] hover:shadow transition-all flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">Ask a question...</p>
                      <p className="text-xs text-slate-500 mt-0.5">Search how-tos, workflows & features</p>
                    </div>
                    <Search className="h-5 w-5 text-slate-400" />
                  </button>

                  <div className="pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">Popular help topics</p>
                    <div className="space-y-1.5">
                      {SUPPORT_TOPICS.map((topic) => (
                        <button
                          key={topic.label}
                          onClick={() => ask(topic.question)}
                          className="w-full bg-white rounded-xl border border-slate-200 p-3 text-left hover:border-[var(--primary)] hover:bg-slate-50 transition-all flex items-center justify-between group"
                        >
                          <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{topic.label}</span>
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[var(--primary)]" />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {chat.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "bg-[var(--primary)] text-white" : "bg-white text-slate-800 border border-slate-200 shadow-xs"}`}>
                        <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                        {msg.links && msg.links.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                            {msg.links.map((link) => (
                              <button
                                key={link.href}
                                onClick={() => goTo(link.href)}
                                className="w-full flex items-center justify-between text-xs font-bold text-[var(--primary)] hover:underline"
                              >
                                <span>{link.label}</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {pending && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 p-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" /> Finding answer...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-slate-200">
              <form
                onSubmit={(e) => { e.preventDefault(); ask(); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask any question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="Send"
                  className="h-10 w-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">Product help & navigation only — for your live data, use the AI Assistant.</p>
            </div>
          </div>
        </div>
      )}

      {/* Circular support FAB — bottom-right, brand primary accent with the app mark */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Open support"}
        title="Help & Support"
        suppressHydrationWarning
        className={`fixed bottom-6 z-40 h-14 w-14 rounded-full bg-[var(--primary)] text-white shadow-xl shadow-black/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-[right,transform] duration-300 ease-in-out will-change-[right,transform] ${assistantExpanded ? "hidden" : assistantOpen ? "right-6 sm:right-[424px]" : "right-6"}`}
      >
        {open ? <X className="h-6 w-6" /> : <span className="text-[26px] font-bold leading-none" aria-hidden="true">?</span>}
      </button>
    </>
  );
}
