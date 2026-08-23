"use client";
import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { X, Phone, PhoneOff, ChevronDown } from "lucide-react";
import { askLandingAssistant, type LandingChatMessage } from "@/lib/ai/landing-chat";

interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: { 0: SpeechRecognitionResultLike }[] }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  // Priority: Microsoft neural "Natural" voices (best quality, Windows/Edge)
  const priority = [
    "Microsoft Sonia Online (Natural) - English (United Kingdom)",
    "Microsoft Libby Online (Natural) - English (United Kingdom)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Mia Online (Natural) - Spanish (Mexico)",
    "Google UK English Female",
    "Samantha",
    "Victoria",
    "Karen",
    "Moira",
    "Fiona",
  ];
  for (const name of priority) { const v = voices.find((x) => x.name === name); if (v) return v; }
  // Fallback: any Microsoft natural online female English voice
  const msNatural = voices.find((v) => v.name.includes("Online (Natural)") && v.lang.startsWith("en") && /aria|jenny|sonia|libby|emily|clara|hazel/i.test(v.name));
  if (msNatural) return msNatural;
  return voices.find((v) => /female|woman/i.test(v.name) && v.lang.startsWith("en"))
    ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
}

function formatTimer(secs: number) {
  return `${Math.floor(secs / 60).toString().padStart(2, "0")}:${(secs % 60).toString().padStart(2, "0")}`;
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [lastCallSecs, setLastCallSecs] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [, start] = useTransition();
  const chatRef = useRef<LandingChatMessage[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callActiveRef = useRef(false);
  const ttsKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    setSpeechSupported(Boolean(SR) && "speechSynthesis" in window);
    function loadVoices() { voiceRef.current = pickFemaleVoice(); }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const stopAll = useCallback(() => {
    recognitionRef.current?.abort();
    if (ttsKeepAliveRef.current) { clearInterval(ttsKeepAliveRef.current); ttsKeepAliveRef.current = null; }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setListening(false); setSpeaking(false);
  }, []);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    stopAll();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setLastCallSecs(callSecs);
    setCallActive(false);
    setCallSecs(0);
  }, [callSecs, stopAll]);

  useEffect(() => {
    if (!open) { if (callActive) endCall(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function speakText(text: string, onDone?: () => void) {
    if (!("speechSynthesis" in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    if (ttsKeepAliveRef.current) clearInterval(ttsKeepAliveRef.current);

    const utter = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utter.voice = voiceRef.current;
    utter.rate = 0.92; utter.pitch = 1.15;
    setSpeaking(true);

    // Chrome bug: speechSynthesis pauses after ~15s — keep it alive with resume()
    ttsKeepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking) window.speechSynthesis.pause(), window.speechSynthesis.resume();
    }, 10000);

    const cleanup = () => {
      if (ttsKeepAliveRef.current) { clearInterval(ttsKeepAliveRef.current); ttsKeepAliveRef.current = null; }
      setSpeaking(false);
    };
    utter.onend = () => { cleanup(); setTimeout(() => onDone?.(), 500); };
    utter.onerror = () => { cleanup(); setTimeout(() => onDone?.(), 500); };
    window.speechSynthesis.speak(utter);
  }

  function startMic() {
    if (!callActiveRef.current) return;
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t && callActiveRef.current) handleUserSpeech(t);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r; setListening(true); r.start();
  }

  function handleUserSpeech(text: string) {
    const next: LandingChatMessage[] = [...chatRef.current, { role: "user", content: text }];
    chatRef.current = next;
    start(async () => {
      const res = await askLandingAssistant(next);
      chatRef.current = [...next, { role: "assistant", content: res.reply }];
      if (callActiveRef.current) speakText(res.reply, () => { if (callActiveRef.current) startMic(); });
    });
  }

  function startCall() {
    callActiveRef.current = true;
    chatRef.current = [];
    setCallActive(true); setCallSecs(0);
    timerRef.current = setInterval(() => setCallSecs((s) => s + 1), 1000);
    speakText("Hi! I'm Nxelio Assistant. How can I help you today?", () => {
      if (callActiveRef.current) startMic();
    });
  }

  const PURPLE = "#7C3AED";
  const GRADIENT = "linear-gradient(135deg,#18A7B8,#5B21B6)";

  return (
    <>
      {/* ── Widget panel ── */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[340px] max-w-[92vw]">
          <div className="lp-anim-pop origin-bottom-right bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* Header strip */}
            <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: GRADIENT }}>
              <img src="/ChatGPT Image Aug 22, 2026, 11_38_35 AM.png" alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0 ring-2 ring-white/40"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              <span className="flex-1 text-sm font-semibold">AI Assistant is Online!</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col items-center px-8 py-8 gap-4 bg-white">

              {callActive ? (
                /* ── ACTIVE CALL ── */
                <>
                  <div className="relative">
                    <img src="/ChatGPT Image Aug 22, 2026, 11_38_35 AM.png" alt="Nxelio AI"
                      className="h-32 w-32 rounded-full object-cover shadow-lg ring-4 ring-violet-200"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                      }} />
                    <div className="h-32 w-32 rounded-full hidden items-center justify-center text-white text-2xl font-bold shadow-lg"
                      style={{ background: GRADIENT }}>AI</div>
                    {(listening || speaking) && (
                      <span className="absolute inset-0 rounded-full animate-ping opacity-25"
                        style={{ background: listening ? "#18A7B8" : PURPLE }} />
                    )}
                  </div>

                  <div className="text-center">
                    <p className="font-bold text-slate-900 text-base flex items-center justify-center gap-1.5">
                      Nxelio AI
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">AI</span>
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">Nxelio Assistant</p>
                  </div>

                  {/* wave bars */}
                  <div className="flex items-end gap-1 h-7">
                    {[1,2,3,4,5].map((i) => (
                      <span key={i} className="w-1.5 rounded-full"
                        style={{
                          background: GRADIENT,
                          height: (listening || speaking) ? `${12 + i * 4}px` : "6px",
                          transition: "height 0.3s ease",
                          animation: (listening || speaking) ? `pulse ${0.4 + i * 0.1}s ease-in-out infinite alternate` : "none",
                        }} />
                    ))}
                  </div>

                  <p className="text-sm font-mono text-slate-500">{formatTimer(callSecs)}</p>
                  <p className="text-xs text-slate-400">{speaking ? "Speaking…" : listening ? "Listening… speak now" : "Connected"}</p>

                  <button onClick={endCall}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-colors shadow">
                    <PhoneOff className="h-4 w-4" /> End Call
                  </button>
                </>
              ) : (
                /* ── IDLE / POST-CALL ── */
                <>
                  <img src="/ChatGPT Image Aug 22, 2026, 11_38_35 AM.png" alt="Nxelio AI"
                    className="h-32 w-32 rounded-full object-cover shadow-lg ring-4 ring-slate-100"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                    }} />
                  <div className="h-32 w-32 rounded-full hidden items-center justify-center text-white text-2xl font-bold shadow-lg"
                    style={{ background: GRADIENT }}>AI</div>

                  <div className="text-center">
                    <p className="font-bold text-slate-900 text-base flex items-center justify-center gap-1.5">
                      Nxelio AI <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">AI</span>
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">Nxelio Assistant</p>
                  </div>

                  {lastCallSecs !== null && (
                    <p className="text-sm text-slate-500 font-medium">
                      Call Ended &nbsp;<span className="font-mono">{formatTimer(lastCallSecs)}</span>
                    </p>
                  )}

                  <button onClick={speechSupported ? startCall : undefined}
                    className="flex items-center gap-2 px-8 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors"
                    style={{ borderColor: PURPLE, color: PURPLE }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = PURPLE; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = PURPLE; }}>
                    <Phone className="h-4 w-4" />
                    {lastCallSecs !== null ? "Talk Again" : "Talk to Us"}
                  </button>

                  {!speechSupported && (
                    <p className="text-xs text-slate-400 text-center">Voice calls work in Chrome or Edge</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="pb-4 text-center">
              <p className="text-xs text-slate-300">
                Powered by <span className="text-slate-400 font-medium">Nxelio</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Launcher button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Talk to Nxelio AI"}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        style={{ background: PURPLE, boxShadow: "0 8px 24px rgba(124,58,237,.5)" }}
      >
        {open ? <X className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
      </button>
    </>
  );
}
