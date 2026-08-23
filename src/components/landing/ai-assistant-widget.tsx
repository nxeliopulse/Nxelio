"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { X, Phone, PhoneOff, ChevronDown } from "lucide-react";
import { askLandingAssistant, type LandingChatMessage } from "@/lib/ai/landing-chat";

interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: { 0: SpeechRecognitionResultLike }[] }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getSR(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: SRConstructor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition ||
    null
  );
}

function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Microsoft Neural "Online (Natural)" voices — best quality and most natural
  const priority = [
    "Microsoft Sonia Online (Natural) - English (United Kingdom)",
    "Microsoft Libby Online (Natural) - English (United Kingdom)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Google UK English Female",
    "Samantha", "Victoria", "Karen", "Moira", "Fiona",
  ];
  for (const name of priority) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  const msNatural = voices.find(
    (v) => v.name.includes("Online (Natural)") && v.lang.startsWith("en") &&
      /aria|jenny|sonia|libby|emily|clara|hazel/i.test(v.name)
  );
  if (msNatural) return msNatural;
  return (
    voices.find((v) => /female|woman/i.test(v.name) && v.lang.startsWith("en")) ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

function isNeuralVoice(voice: SpeechSynthesisVoice | null): boolean {
  return Boolean(voice?.name.includes("Online (Natural)") || voice?.name.startsWith("Google"));
}

function formatTimer(secs: number) {
  return `${Math.floor(secs / 60).toString().padStart(2, "0")}:${(secs % 60).toString().padStart(2, "0")}`;
}

export function AiAssistantWidget() {
  const [open, setOpen]               = useState(false);
  const [callActive, setCallActive]   = useState(false);
  const [callSecs, setCallSecs]       = useState(0);
  const [lastCallSecs, setLastCallSecs] = useState<number | null>(null);
  const [listening, setListening]     = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [thinking, setThinking]       = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const chatRef          = useRef<LandingChatMessage[]>([]);
  const recognitionRef   = useRef<SpeechRecognitionLike | null>(null);
  const voiceRef         = useRef<SpeechSynthesisVoice | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const callActiveRef    = useRef(false);
  const ttsKeepAliveRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const ttsFallbackRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callSecsRef      = useRef(0);
  // Prevents double mic-restart when both onerror and onend fire for the same session
  const micRestartLock   = useRef(false);

  // Load voices — may fire immediately or after onvoiceschanged
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSpeechSupported(Boolean(getSR()) && "speechSynthesis" in window);
    function loadVoices() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) voiceRef.current = pickFemaleVoice(voices);
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const clearTtsTimers = useCallback(() => {
    if (ttsKeepAliveRef.current) { clearInterval(ttsKeepAliveRef.current); ttsKeepAliveRef.current = null; }
    if (ttsFallbackRef.current)  { clearTimeout(ttsFallbackRef.current);   ttsFallbackRef.current  = null; }
  }, []);

  const stopAll = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    clearTtsTimers();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setListening(false);
    setSpeaking(false);
    setThinking(false);
  }, [clearTtsTimers]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    stopAll();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setLastCallSecs(callSecsRef.current);
    setCallActive(false);
    setCallSecs(0);
    callSecsRef.current = 0;
  }, [stopAll]);

  useEffect(() => {
    if (!open && callActive) endCall();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speakText = useCallback((text: string, onDone?: () => void) => {
    if (!("speechSynthesis" in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    clearTtsTimers();

    // Reload voice if needed
    if (!voiceRef.current) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) voiceRef.current = pickFemaleVoice(voices);
    }

    const utter = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utter.voice = voiceRef.current;

    // Natural tone settings:
    // Neural voices (Microsoft/Google) are already optimised — keep rate/pitch
    // at 1.0 so the neural model sounds its best. For classic TTS voices,
    // a slightly slower rate and neutral pitch reads more naturally.
    if (isNeuralVoice(voiceRef.current)) {
      utter.rate = 1.0;
      utter.pitch = 1.0;
    } else {
      utter.rate = 0.93;
      utter.pitch = 1.05;
    }

    setSpeaking(true);

    // Chrome bug: TTS silently stops after ~15s — keep it alive with pause/resume
    ttsKeepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10_000);

    // Safety net: if onend never fires (browser bug), force-proceed after a
    // generous timeout so the call never gets permanently stuck
    const maxMs = Math.max(8_000, text.length * 80 + 3_000);
    ttsFallbackRef.current = setTimeout(() => {
      if (speaking) {
        clearTtsTimers();
        setSpeaking(false);
        setTimeout(() => onDone?.(), 200);
      }
    }, maxMs);

    const cleanup = () => {
      clearTtsTimers();
      setSpeaking(false);
    };
    // 500ms echo-prevention delay before reopening mic
    utter.onend   = () => { cleanup(); setTimeout(() => onDone?.(), 500); };
    utter.onerror = () => { cleanup(); setTimeout(() => onDone?.(), 500); };
    window.speechSynthesis.speak(utter);
  }, [clearTtsTimers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic ────────────────────────────────────────────────────────────────────
  const startMic = useCallback(() => {
    if (!callActiveRef.current) return;
    const SR = getSR();
    if (!SR) return;

    micRestartLock.current = false;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;

    let gotResult = false;

    r.onresult = (e) => {
      gotResult = true;
      const transcript = e.results[0]?.[0]?.transcript?.trim();
      if (transcript && callActiveRef.current) handleUserSpeech(transcript);
    };

    r.onerror = (e) => {
      setListening(false);
      if (!gotResult && callActiveRef.current && e.error !== "aborted" && !micRestartLock.current) {
        micRestartLock.current = true;
        setTimeout(() => { if (callActiveRef.current) startMic(); }, 700);
      }
    };

    r.onend = () => {
      setListening(false);
      if (!gotResult && callActiveRef.current && !micRestartLock.current) {
        micRestartLock.current = true;
        setTimeout(() => { if (callActiveRef.current) startMic(); }, 700);
      }
    };

    recognitionRef.current = r;
    try {
      r.start();
      setListening(true); // only set after start() succeeds
    } catch {
      // start() failed (permission denied, double-start, etc.) — retry
      if (callActiveRef.current) setTimeout(() => startMic(), 1_000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI response ─────────────────────────────────────────────────────────
  function handleUserSpeech(text: string) {
    recognitionRef.current?.abort(); // stop mic while AI is thinking
    recognitionRef.current = null;

    const next: LandingChatMessage[] = [...chatRef.current, { role: "user", content: text }];
    chatRef.current = next;
    setListening(false);
    setThinking(true);

    // Safety net: if AI call hangs for >30s, unblock the call
    const thinkingTimeout = setTimeout(() => {
      if (callActiveRef.current) {
        setThinking(false);
        speakText("Sorry, I had trouble connecting. Please try again.", () => {
          if (callActiveRef.current) startMic();
        });
      }
    }, 30_000);

    askLandingAssistant(next)
      .then((res) => {
        clearTimeout(thinkingTimeout);
        setThinking(false);
        chatRef.current = [...next, { role: "assistant", content: res.reply }];
        if (callActiveRef.current) {
          speakText(res.reply, () => { if (callActiveRef.current) startMic(); });
        }
      })
      .catch(() => {
        clearTimeout(thinkingTimeout);
        setThinking(false);
        if (callActiveRef.current) {
          speakText("Sorry, something went wrong. Please try again.", () => {
            if (callActiveRef.current) startMic();
          });
        }
      });
  }

  // ── Call start ─────────────────────────────────────────────────────────
  function startCall() {
    callActiveRef.current = true;
    callSecsRef.current = 0;
    chatRef.current = [];
    setCallActive(true);
    setCallSecs(0);

    timerRef.current = setInterval(() => {
      callSecsRef.current += 1;
      setCallSecs((s) => s + 1);
    }, 1000);

    // Short delay so the voice list has time to populate
    setTimeout(() => {
      if (!callActiveRef.current) return;
      speakText("Hi! I'm Nxelio Assistant. How can I help you today?", () => {
        if (callActiveRef.current) startMic();
      });
    }, 400);
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  const PURPLE = "#7C3AED";
  const GRADIENT = "linear-gradient(135deg,#18A7B8,#5B21B6)";

  function statusLabel() {
    if (thinking)  return "Thinking…";
    if (speaking)  return "Speaking…";
    if (listening) return "Listening… speak now";
    return "Connected";
  }

  const wavesActive = listening || speaking || thinking;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[340px] max-w-[92vw]">
          <div className="lp-anim-pop origin-bottom-right bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: GRADIENT }}>
              <img src="/ChatGPT Image Aug 22, 2026, 11_38_35 AM.png" alt=""
                className="h-8 w-8 rounded-full object-cover flex-shrink-0 ring-2 ring-white/40"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              <span className="flex-1 text-sm font-semibold">AI Assistant is Online!</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col items-center px-8 py-8 gap-4 bg-white">
              {callActive ? (
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
                    {wavesActive && (
                      <span className="absolute inset-0 rounded-full animate-ping opacity-20"
                        style={{ background: thinking ? "#f59e0b" : listening ? "#18A7B8" : PURPLE }} />
                    )}
                  </div>

                  <div className="text-center">
                    <p className="font-bold text-slate-900 text-base flex items-center justify-center gap-1.5">
                      Nxelio AI
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">AI</span>
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">Nxelio Assistant</p>
                  </div>

                  <div className="flex items-end gap-1 h-7">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className="w-1.5 rounded-full"
                        style={{
                          background: thinking ? "#f59e0b" : GRADIENT,
                          height: wavesActive ? `${12 + i * 4}px` : "6px",
                          transition: "height 0.3s ease",
                          animation: wavesActive ? `pulse ${0.4 + i * 0.1}s ease-in-out infinite alternate` : "none",
                        }} />
                    ))}
                  </div>

                  <p className="text-sm font-mono text-slate-500">{formatTimer(callSecs)}</p>
                  <p className="text-xs text-slate-400">{statusLabel()}</p>

                  <button onClick={endCall}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-colors shadow">
                    <PhoneOff className="h-4 w-4" /> End Call
                  </button>
                </>
              ) : (
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
                      Nxelio AI
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">AI</span>
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">Nxelio Assistant</p>
                  </div>

                  {lastCallSecs !== null && (
                    <p className="text-sm text-slate-500 font-medium">
                      Call Ended &nbsp;<span className="font-mono">{formatTimer(lastCallSecs)}</span>
                    </p>
                  )}

                  <button
                    onClick={speechSupported ? startCall : undefined}
                    className="flex items-center gap-2 px-8 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors"
                    style={{ borderColor: PURPLE, color: PURPLE }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = PURPLE;
                      (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = PURPLE;
                    }}>
                    <Phone className="h-4 w-4" />
                    {lastCallSecs !== null ? "Talk Again" : "Talk to Us"}
                  </button>

                  {!speechSupported && (
                    <p className="text-xs text-slate-400 text-center">Voice calls work in Chrome or Edge</p>
                  )}
                </>
              )}
            </div>

            <div className="pb-4 text-center">
              <p className="text-xs text-slate-300">
                Powered by <span className="text-slate-400 font-medium">Nxelio</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Talk to Nxelio AI"}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        style={{ background: PURPLE, boxShadow: "0 8px 24px rgba(124,58,237,.5)" }}>
        {open ? <X className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
      </button>
    </>
  );
}
