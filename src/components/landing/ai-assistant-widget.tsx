"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { X, Send, Loader2, Mic, MicOff, Volume2, VolumeX, Sparkles, Volume1 } from "lucide-react";
import { askLandingAssistant, type LandingChatMessage } from "@/lib/ai/landing-chat";

const SUGGESTED_QUESTIONS = [
  "What does Nxelio Nurture do?",
  "What's included in the pricing plans?",
  "How does AI lead scoring work?",
  "Is my data secure?",
];

// Minimal ambient types for the (still non-standard, vendor-prefixed) Web Speech API.
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: { 0: SpeechRecognitionResultLike }[] }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<LandingChatMessage[]>([]);
  const [pending, start] = useTransition();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [speechInputSupported, setSpeechInputSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser feature detection on mount
    setSpeechOutputSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    const SR = typeof window !== "undefined"
      ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
        || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
      : undefined;
    setSpeechInputSupported(Boolean(SR));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Stop any in-flight mic/voice when the panel closes or unmounts.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- stopping in-flight mic/voice when the panel closes
      setListening(false);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [open]);

  function speak(text: string, index: number) {
    if (!speechOutputSupported) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.onend = () => setSpeakingIndex((i) => (i === index ? null : i));
    utter.onerror = () => setSpeakingIndex((i) => (i === index ? null : i));
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if (speechOutputSupported) window.speechSynthesis.cancel();
    setSpeakingIndex(null);
  }

  function ask(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    const next: LandingChatMessage[] = [...chat, { role: "user", content: message }];
    setChat(next);
    start(async () => {
      const res = await askLandingAssistant(next);
      setChat((c) => {
        const updated: LandingChatMessage[] = [...c, { role: "assistant", content: res.reply }];
        if (voiceEnabled && res.reply) speak(res.reply, updated.length - 1);
        return updated;
      });
    });
  }

  function toggleMic() {
    if (!speechInputSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) ask(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function toggleVoice() {
    setVoiceEnabled((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-24 sm:right-6 z-50 w-full sm:w-[380px] sm:max-w-[92vw]">
          <div className="lp-anim-pop origin-bottom sm:origin-bottom-right bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[78vh] sm:max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="p-5 text-white" style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1">
                  {speechOutputSupported && (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      aria-label={voiceEnabled ? "Mute voice replies" : "Unmute voice replies"}
                      title={voiceEnabled ? "Voice replies on" : "Voice replies off"}
                      className="p-1.5 rounded-md hover:bg-white/15"
                    >
                      {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close AI assistant" className="p-1.5 rounded-md hover:bg-white/15">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <h2 className="mt-3 text-lg font-bold">Ask Nxelio Nurture AI</h2>
              <p className="text-white/80 text-sm">Product questions, answered instantly — with voice.</p>
            </div>

            {/* Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {chat.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Try asking</p>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="w-full text-left bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 hover:border-teal-300 hover:shadow-sm transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                chat.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className="max-w-[88%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                          m.role === "user"
                            ? "text-white rounded-br-sm"
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                        }`}
                        style={m.role === "user" ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)" } : undefined}
                      >
                        {m.content}
                      </div>
                      {m.role === "assistant" && speechOutputSupported && m.content && (
                        <button
                          onClick={() => (speakingIndex === i ? stopSpeaking() : speak(m.content, i))}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-teal-600"
                        >
                          {speakingIndex === i ? <><Volume1 className="h-3 w-3 animate-pulse" /> Speaking… tap to stop</> : <><Volume2 className="h-3 w-3" /> Replay</>}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {pending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-slate-500 inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100 bg-white">
              <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-center gap-2">
                {speechInputSupported && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    aria-label={listening ? "Stop voice input" : "Ask by voice"}
                    title={listening ? "Listening… click to stop" : "Ask by voice"}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      listening ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {listening ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
                  </button>
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={listening ? "Listening…" : "Ask about Nxelio Nurture…"}
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                  disabled={pending}
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="Send"
                  className="h-10 w-10 rounded-xl text-white flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        title="Ask Nxelio Nurture AI"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full text-white shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 8px 24px rgba(24,167,184,.45)" }}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}
