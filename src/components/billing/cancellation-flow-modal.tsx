"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, ChevronRight, ChevronLeft, Calendar, Clock, Video } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { CancellationReason } from "@/lib/queries/cancellation-types";
import { REASON_LABELS } from "@/lib/queries/cancellation-types";
import type { SubscriptionWithPlan } from "@/lib/queries/subscription-types";

interface Props {
  open: boolean;
  onClose: () => void;
  subscription: SubscriptionWithPlan | null;
}

const REASON_OPTIONS = Object.entries(REASON_LABELS) as [CancellationReason, string][];

const TIME_OPTIONS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "13:00", "13:30", "14:00", "14:30", "15:00",
  "15:30", "16:00", "16:30", "17:00",
];

export function CancellationFlowModal({ open, onClose, subscription }: Props) {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [feedback, setFeedback] = useState("");
  const [wantsMeeting, setWantsMeeting] = useState<boolean | null>(null);
  const [meetingProvider, setMeetingProvider] = useState<"zoom" | "google_meet">("zoom");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("10:00");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep(1);
    setReason("");
    setFeedback("");
    setWantsMeeting(null);
    setMeetingProvider("zoom");
    setPreferredDate("");
    setPreferredTime("10:00");
    setError(null);
    setSubmitted(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function next() {
    setError(null);
    if (step === 1 && !reason) { setError("Please select a reason."); return; }
    if (step === 2 && wantsMeeting === null) { setError("Please select whether you'd like to schedule a call."); return; }
    if (step === 2 && wantsMeeting && !preferredDate) { setError("Please select a preferred date."); return; }
    setStep(s => s + 1);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const sub = subscription;
      const body = {
        planId: sub?.plan_id ?? undefined,
        reason,
        feedback: feedback.trim() || undefined,
        wantsMeeting: wantsMeeting === true,
        meetingProvider: wantsMeeting ? meetingProvider : undefined,
        preferredDate: wantsMeeting ? preferredDate : undefined,
        preferredTime: wantsMeeting ? preferredTime : undefined,
      };
      const res = await fetch("/api/billing/cancel-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Something went wrong — please try again.");
        return;
      }
      setSubmitted(true);
    });
  }

  const todayIso = new Date().toISOString().split("T")[0];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={submitted ? "Request received" : `Cancel subscription — Step ${step} of 3`}
      size="md"
    >
      <div className="p-5 space-y-5">
        {submitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center mx-auto">
              <Calendar className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">We&apos;ve received your request</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your subscription stays <strong>active</strong> while we review your request.
              {wantsMeeting ? " We'll send you a meeting invite at your preferred time." : " A member of our team will reach out to you shortly."}
            </p>
            <Button className="mt-2" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <>
            {/* ── Step 1: Reason + Feedback ──────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">What&apos;s your main reason for cancelling?</p>
                  <div className="space-y-2">
                    {REASON_OPTIONS.map(([value, label]) => {
                      const isSelected = reason === value;
                      return (
                        <label
                          key={value}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/60 dark:border-blue-500 shadow-xs"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="reason"
                            value={value}
                            checked={isSelected}
                            onChange={() => setReason(value)}
                            className="accent-blue-600 h-4 w-4"
                          />
                          <span
                            className={`text-sm ${
                              isSelected
                                ? "text-blue-950 dark:text-blue-100 font-semibold"
                                : "text-slate-700 dark:text-slate-200 font-normal"
                            }`}
                          >
                            {label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1 block">Additional feedback (optional)</label>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Tell us more about your experience…"
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* ── Step 2: Meeting Preference ─────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Would you like to speak with our team before cancelling?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">We may be able to help resolve your concerns or make a special offer.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setWantsMeeting(true)}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                        wantsMeeting === true
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      Yes, I&apos;d like a call
                    </button>
                    <button
                      onClick={() => setWantsMeeting(false)}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                        wantsMeeting === false
                          ? "border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      No thanks
                    </button>
                  </div>
                </div>

                {wantsMeeting && (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1 block flex items-center gap-1.5">
                        <Video className="h-4 w-4 text-slate-400" /> Meeting platform
                      </label>
                      <div className="flex gap-2">
                        {(["zoom", "google_meet"] as const).map(p => (
                          <button
                            key={p}
                            onClick={() => setMeetingProvider(p)}
                            className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              meetingProvider === p
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                          >
                            {p === "zoom" ? "Zoom" : "Google Meet"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1 block flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-slate-400" /> Preferred date
                      </label>
                      <input
                        type="date"
                        value={preferredDate}
                        min={todayIso}
                        onChange={e => setPreferredDate(e.target.value)}
                        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1 block flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-slate-400" /> Preferred time (UTC)
                      </label>
                      <select
                        value={preferredTime}
                        onChange={e => setPreferredTime(e.target.value)}
                        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Review ─────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Please review your request before submitting:</p>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="px-4 py-3 flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Reason</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{reason ? REASON_LABELS[reason as CancellationReason] : "—"}</span>
                  </div>
                  {feedback && (
                    <div className="px-4 py-3 text-sm">
                      <span className="text-slate-500 dark:text-slate-400 block mb-1">Feedback</span>
                      <span className="text-slate-900 dark:text-slate-100">{feedback}</span>
                    </div>
                  )}
                  <div className="px-4 py-3 flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Meeting requested</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{wantsMeeting ? "Yes" : "No"}</span>
                  </div>
                  {wantsMeeting && (
                    <>
                      <div className="px-4 py-3 flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Platform</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{meetingProvider === "zoom" ? "Zoom" : "Google Meet"}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Preferred date & time</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{preferredDate} {preferredTime} UTC</span>
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your subscription will remain <strong>active</strong> while we review your request.
                  We&apos;ll follow up via email.
                </p>
              </div>
            )}

            {/* ── Error ──────────────────────────────────────────── */}
            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* ── Navigation ─────────────────────────────────────── */}
            <div className="flex justify-between items-center pt-1">
              {step > 1 ? (
                <Button variant="outline" onClick={() => { setError(null); setStep(s => s - 1); }} disabled={pending}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
              ) : (
                <Button variant="outline" onClick={handleClose} disabled={pending}>Cancel</Button>
              )}
              {step < 3 ? (
                <Button onClick={next} disabled={pending}>
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="danger" onClick={submit} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Submit request
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
