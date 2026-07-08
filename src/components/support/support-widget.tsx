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

export function SupportWidget({ assistantOpen = false }: { assistantOpen?: boolean }) {
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
            <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {view === "chat" && (
                    <button onClick={newChat} aria-label="Back" className="p-1 -ml-1 rounded-md hover:bg-white/15">
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                  <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <LogoMark className="h-5 w-5 text-white" />
                  </div>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close support" className="p-1 rounded-md hover:bg-white/15">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <h2 className="mt-3 text-xl font-bold">Hi there 👋</h2>
              <p className="text-blue-100 text-sm">How can we help you use LeadPro?</p>
            </div>

            {/* Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {view === "home" ? (
                <>
                  <button
                    onClick={() => { setView("chat"); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left shadow-sm hover:border-blue-300 hover:shadow transition-all flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">Ask a question</p>
                      <p className="text-xs text-slate-500 mt-0.5">Product help, how-tos & navigation</p>
                    </div>
                    <div className="h-9 w-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-4.5 w-4.5" />
                    </div>
                  </button>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 text-slate-400">
                      <Search className="h-4 w-4" />
                      <span className="text-sm">Browse common topics</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {SUPPORT_TOPICS.map((t) => (
                        <li key={t.label}>
                          <button
                            onClick={() => ask(t.question)}
                            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                          >
                            <span className="text-sm text-slate-700">{t.label}</span>
                            <ChevronRight className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  {chat.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div className="max-w-[88%]">
                        <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                        }`}>
                          {m.content}
                        </div>
                        {m.links && m.links.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.links.map((l, j) => (
                              <button
                                key={j}
                                onClick={() => goTo(l.href)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 hover:bg-blue-50 transition-colors"
                              >
                                {l.label} <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {pending && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-slate-500 inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding the answer…
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100 bg-white">
              <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about a feature or where to find it…"
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
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">Product help & navigation only — for your live data, use the AI Assistant.</p>
            </div>
          </div>
        </div>
      )}

      {/* Circular support FAB — bottom-right, brand blue with the app mark */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Open support"}
        title="Help & Support"
        className={`fixed bottom-6 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-[right,transform] duration-300 ease-in-out ${assistantOpen ? "right-6 sm:right-[424px]" : "right-6"}`}
      >
        {open ? <X className="h-6 w-6" /> : <span className="text-[26px] font-bold leading-none" aria-hidden="true">?</span>}
      </button>
    </>
  );
}
