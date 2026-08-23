"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { X, CalendarDays, CheckCircle2, AlertCircle, Loader2, ChevronLeft, ChevronRight, ChevronDown, Clock, Video, Globe, ArrowLeft, Sparkles, User, UserPlus, Trash2, Download } from "lucide-react";
import { submitDemoRequest } from "@/lib/queries/demo-request";
import { PhoneInput, formatPhoneForStorage, isPhoneValid } from "@/components/ui/phone-input";
import type { CountryCode } from "libphonenumber-js";

const INDUSTRIES = ["SaaS", "E-commerce", "Healthcare", "Finance", "Manufacturing", "Real Estate", "Education", "Other"];
const EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-500", "500+"];
const REVENUE_BANDS = ["Under $10k", "$10k - $50k", "$50k - $250k", "$250k - $1M", "$1M+"];
const REFERRAL_SOURCES = ["Google Search", "LinkedIn", "Referral", "Twitter / X", "Other"];

const MEETING_DURATION_MIN = 30;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;

// A short, common list — Calendly's own timezone picker is exhaustive, but a
// prospect only ever needs their own zone plus the handful of others their
// team spans. Falls back to whatever the browser detects if it's not here.
const COMMON_TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland", "UTC",
];

const EMPTY_DETAILS = {
  fullName: "", businessEmail: "", phone: "", industry: "",
  employeeCount: "", monthlyRevenue: "", purpose: "", referralSource: "",
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-400";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

/** 6x7 grid of calendar days covering `month`, including the trailing/leading days
 *  from adjacent months needed to fill out full weeks — same pattern used by the
 *  app's own meetings mini-calendar. Weeks are Monday-first, matching the
 *  weekday header row rendered above the grid. */
function monthGrid(month: Date): Date[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstOfMonth);
  // getDay() is 0=Sun..6=Sat; shift so Monday is the start of the week.
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isPastDay(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** UTC offset in minutes (positive if ahead of UTC) that `tz` observes at
 *  approximately `date` — correctly reflects that zone's DST rules on that
 *  date. Deliberately uses Intl.DateTimeFormat directly on a fixed instant
 *  rather than the common `new Date(str.toLocaleString())` round-trip: that
 *  trick silently re-parses through the *browser's own* default timezone,
 *  so it only happens to be correct when the browser's zone is UTC+0 — it
 *  breaks precisely when a user picks a zone different from their own,
 *  which is the whole point of this feature. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

/** Converts a wall-clock time (year/month/day/hour/minute) meant as local
 *  time in a named IANA zone to the actual UTC instant it represents —
 *  there's no built-in JS API for this. One-pass DST resolution (using the
 *  naive UTC-anchored guess to pick which DST rule applies): good enough for
 *  business-hours slots, since it can only be wrong within a few hours of an
 *  actual DST transition. */
function zonedWallTimeToDate(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m, d, hh, mm, 0));
  const offsetMin = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offsetMin * 60000);
}

/** Half-hour slots within business hours, computed in `tz` (not the visitor's
 *  own local time) so switching the timezone selector actually moves the
 *  bookable window instead of just relabeling the same local times. */
function timeSlotsFor(day: Date, tz: string): Date[] {
  const slots: Date[] = [];
  const y = day.getFullYear(), m = day.getMonth(), d = day.getDate();
  for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
    for (const mins of [0, 30]) {
      const s = zonedWallTimeToDate(y, m, d, h, mins, tz);
      if (s.getTime() > Date.now()) slots.push(s);
    }
  }
  return slots;
}

function decomposeTime(d: Date): { hour: string; minute: string; meridiem: "AM" | "PM" } {
  let h = d.getHours();
  const meridiem: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { hour: String(h), minute: String(d.getMinutes()).padStart(2, "0"), meridiem };
}

function timeLabel(d: Date, tz: string): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz });
}

function dayLabel(d: Date, tz: string): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: tz });
}

function tzShortLabel(tz: string): string {
  return tz.replace(/_/g, " ").split("/").pop() || tz;
}

/** Human-readable zone name (e.g. "India Standard Time") for the labeled
 *  time-zone block, falling back to the short IANA name if Intl can't resolve one. */
function tzLongLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: "long" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || tzShortLabel(tz);
  } catch {
    return tzShortLabel(tz);
  }
}

function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** RFC5545 requires these characters to be backslash-escaped in text fields. */
function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/** "Add to Calendar" links for the confirmation screen — Calendly always
 *  offers these after a booking succeeds. Google/Outlook are plain deep-link
 *  URLs (no auth/API needed); Apple and everything else gets a downloadable
 *  .ics file, which is the universal fallback every calendar app understands. */
function buildCalendarLinks(start: Date, joinUrl: string | undefined) {
  const end = new Date(start.getTime() + MEETING_DURATION_MIN * 60000);
  const title = "Nxelio Nurture Demo";
  const description = joinUrl ? `Join: ${joinUrl}` : "Nxelio Nurture demo call.";

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${toIcsUtc(start)}/${toIcsUtc(end)}&details=${encodeURIComponent(description)}`;

  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(title)}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${encodeURIComponent(description)}`;

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nxelio Nurture//Demo Booking//EN",
    "BEGIN:VEVENT",
    `UID:${start.getTime()}@nxelio`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const ics_url = `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;

  return { google, outlook, ics: ics_url };
}

type Step = "calendar" | "details" | "done";

export function BookDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>("US");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ formattedDate: string; formattedTime: string; joinUrl?: string } | null>(null);

  const detectedTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  }, []);
  const [timezone, setTimezone] = useState(detectedTimezone);
  const timezoneOptions = useMemo(
    () => Array.from(new Set([detectedTimezone, ...COMMON_TIMEZONES])),
    [detectedTimezone]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function reset() {
    setStep("calendar");
    setMonth(new Date());
    setSelectedDate(null);
    setSelectedTime(null);
    setDetails(EMPTY_DETAILS);
    setGuestEmails([]);
    setGuestInput("");
    setPhoneCountry("US");
    setTimezone(detectedTimezone);
    setError(null);
    setDone(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickTime(t: Date) {
    if (!details.fullName.trim()) { setError("Please enter your name before picking a time."); return; }
    if (!details.businessEmail.includes("@")) { setError("Please enter a valid email before picking a time."); return; }
    setSelectedTime(t);
    setError(null);
    setStep("details");
  }

  function addGuest() {
    const email = guestInput.trim().toLowerCase();
    if (!email.includes("@")) { setError("Enter a valid guest email."); return; }
    if (guestEmails.includes(email)) { setGuestInput(""); return; }
    setGuestEmails((prev) => [...prev, email]);
    setGuestInput("");
    setError(null);
  }

  function removeGuest(email: string) {
    setGuestEmails((prev) => prev.filter((e) => e !== email));
  }

  function submit() {
    if (!selectedTime) return;
    setError(null);
    if (!details.fullName.trim()) return setError("Please enter your name.");
    if (!details.businessEmail.includes("@")) return setError("Please enter a valid business email.");
    if (!details.phone.trim()) return setError("Please enter your phone number.");
    if (!isPhoneValid(details.phone, phoneCountry)) return setError("Phone number isn't valid for the selected country.");
    if (!details.industry) return setError("Please select your industry.");
    if (!details.employeeCount) return setError("Please select your number of employees.");
    if (!details.monthlyRevenue) return setError("Please select your monthly revenue.");

    const { hour, minute, meridiem } = decomposeTime(selectedTime);
    const y = selectedTime.getFullYear();
    const m = String(selectedTime.getMonth() + 1).padStart(2, "0");
    const d = String(selectedTime.getDate()).padStart(2, "0");
    const purposeWithGuests = guestEmails.length
      ? `${details.purpose ? `${details.purpose}\n\n` : ""}Guests: ${guestEmails.join(", ")}`
      : details.purpose;

    start(async () => {
      const res = await submitDemoRequest({
        ...details,
        purpose: purposeWithGuests,
        phone: formatPhoneForStorage(details.phone, phoneCountry),
        date: `${y}-${m}-${d}`,
        hour, minute, meridiem,
      });
      if (!res.ok) { setError(res.error || "Couldn't book that time. Please try again."); return; }
      setDone({ formattedDate: res.formattedDate!, formattedTime: res.formattedTime!, joinUrl: res.joinUrl });
      setStep("done");
    });
  }

  const grid = monthGrid(month);
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const slots = selectedDate ? timeSlotsFor(selectedDate, timezone) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="no-scrollbar relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-slate-400 hover:bg-[#f1f5f9] hover:text-[#475569]"
        >
          <X className="h-5 w-5" />
        </button>

        {step === "done" && done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900">You&apos;re booked!</h2>
            <p className="mt-3 text-slate-600">Your Nxelio Nurture demo is confirmed for</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {done.formattedDate} at {done.formattedTime}
            </p>
            <p className="mt-4 text-sm text-slate-500">
              A confirmation with your meeting link is on its way to {details.businessEmail}
              {guestEmails.length > 0 && <> and {guestEmails.length} guest{guestEmails.length === 1 ? "" : "s"}</>}.
            </p>

            {selectedTime && (() => {
              const links = buildCalendarLinks(selectedTime, done.joinUrl);
              return (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Add to calendar</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <a href={links.google} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc]">
                      Google Calendar
                    </a>
                    <a href={links.outlook} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc]">
                      Outlook
                    </a>
                    <a href={links.ics} download="nxelio-demo.ics" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc]">
                      <Download className="h-3 w-3" /> Apple / iCal
                    </a>
                  </div>
                </div>
              );
            })()}

            <button
              onClick={handleClose}
              className="mt-6 w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
            >
              Done
            </button>
          </div>
        ) : step === "details" && selectedTime ? (
          <div className="p-6 sm:p-8">
            <button
              onClick={() => { setStep("calendar"); setSelectedTime(null); }}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#334155] mb-4"
            >
              <ArrowLeft className="h-4 w-4" /> Change time
            </button>

            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1 mb-6">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-[#18A7B8]" /> {dayLabel(selectedTime, timezone)}
              </span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> {timeLabel(selectedTime, timezone)} · {MEETING_DURATION_MIN} min</span>
              <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-slate-400" /> Google Meet</span>
              <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-slate-400" /> {tzShortLabel(timezone)}</span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 mb-1">Enter your details</h2>
            <p className="text-sm text-slate-500 mb-5">Tell us a bit about your business so we can tailor the walkthrough.</p>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-slate-700">
                Booking as <span className="font-semibold text-slate-900">{details.fullName}</span> ({details.businessEmail})
              </div>

              <div className="max-w-xs">
                <label className={labelClass}>Phone number *</label>
                <PhoneInput label="" country={phoneCountry} value={details.phone} onCountryChange={setPhoneCountry} onValueChange={(v) => setDetails({ ...details, phone: v })} inputClassName={inputClass} />
              </div>

              {/* Add guests — a real Calendly option on its details step: invite
                  extra attendees to the same booked meeting. */}
              <div>
                <label htmlFor="demo-guest-email" className={labelClass}>Add guests (optional)</label>
                <div className="flex gap-2">
                  <input
                    id="demo-guest-email"
                    type="email"
                    value={guestInput}
                    onChange={(e) => setGuestInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
                    placeholder="colleague@company.com"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={addGuest}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-[#f8fafc]"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
                {guestEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {guestEmails.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 max-w-[220px]">
                        <span className="truncate">{email}</span>
                        <button type="button" onClick={() => removeGuest(email)} className="text-slate-400 hover:text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="demo-industry" className={labelClass}>Working industry *</label>
                  <select id="demo-industry" value={details.industry} onChange={(e) => setDetails({ ...details, industry: e.target.value })} className={inputClass}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="demo-employee-count" className={labelClass}>Number of employees *</label>
                  <select id="demo-employee-count" value={details.employeeCount} onChange={(e) => setDetails({ ...details, employeeCount: e.target.value })} className={inputClass}>
                    <option value="">Select range</option>
                    {EMPLOYEE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="demo-revenue" className={labelClass}>Company&apos;s monthly revenue *</label>
                  <select id="demo-revenue" value={details.monthlyRevenue} onChange={(e) => setDetails({ ...details, monthlyRevenue: e.target.value })} className={inputClass}>
                    <option value="">Select range</option>
                    {REVENUE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="demo-purpose" className={labelClass}>Purpose of the demo</label>
                <textarea id="demo-purpose" rows={2} value={details.purpose} onChange={(e) => setDetails({ ...details, purpose: e.target.value })} placeholder="What would you like to see?" className={`${inputClass} resize-none`} />
              </div>

              <div>
                <label htmlFor="demo-referral" className={labelClass}>How did you hear about us?</label>
                <select id="demo-referral" value={details.referralSource} onChange={(e) => setDetails({ ...details, referralSource: e.target.value })} className={inputClass}>
                  <option value="">Select an option</option>
                  {REFERRAL_SOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <button
                onClick={submit}
                disabled={pending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
              >
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : "Confirm demo"}
              </button>
            </div>
          </div>
        ) : (
          // Step 1 — Calendly-style layout: fixed info column on the left, and on the
          // right a calendar-only region that expands into calendar + time-slot-list
          // once a date is picked (2 columns before a date is picked, 3 after).
          <div>
            <div className="p-6 sm:p-8 pb-4 sm:pb-4 border-b border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="demo-full-name" className={labelClass}>Your name *</label>
                  <input id="demo-full-name" value={details.fullName} onChange={(e) => setDetails({ ...details, fullName: e.target.value })} placeholder="Jane Doe" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="demo-business-email" className={labelClass}>Your email *</label>
                  <input id="demo-business-email" type="email" value={details.businessEmail} onChange={(e) => setDetails({ ...details, businessEmail: e.target.value })} placeholder="you@company.com" className={inputClass} />
                </div>
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> <span>{error}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col lg:flex-row">
              {/* Info column — fixed width, always visible regardless of booking progress. */}
              <div className="lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col">
                <div
                  className="flex items-center gap-2 px-6 sm:px-8 py-5 text-white"
                  style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
                >
                  <Sparkles className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-bold">Nxelio Nurture</span>
                </div>

                <div className="p-6 sm:p-8 flex-1 flex flex-col">
                  <div
                    className="h-14 w-14 rounded-full ring-4 ring-white flex items-center justify-center text-white -mt-9 mb-3 shadow-sm flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
                  >
                    <User className="h-6 w-6" />
                  </div>

                  <p className="text-xs font-medium text-slate-500">Nxelio Nurture Team</p>
                  <h2 className="text-lg font-bold text-slate-900 mt-1 leading-snug">AI Lead Nurturing Demo</h2>

                  <div className="mt-4 space-y-2.5 text-sm text-slate-600">
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400 flex-shrink-0" /> {MEETING_DURATION_MIN} min</div>
                    <div className="flex items-center gap-2"><Video className="h-4 w-4 text-slate-400 flex-shrink-0" /> Web conferencing details provided upon confirmation</div>
                  </div>

                  <div className="mt-5 text-sm text-slate-500 leading-relaxed">
                    <p className="font-bold text-slate-700 mb-1.5">See Nxelio Nurture in Action</p>
                    <p>
                      Watch how Nxelio Nurture's <span className="font-semibold text-slate-700">AI planner, multi-channel outreach, and pipeline analytics</span> help your team turn more leads into revenue — walked through live for your industry and team size.
                    </p>
                  </div>

                  <div className="mt-auto pt-6 flex items-center gap-3 text-xs text-slate-400">
                    <span>Cookie settings</span>
                    <span className="text-[#cbd5e1]">·</span>
                    <a href="/privacy" className="hover:text-[#475569] hover:underline">Privacy Policy</a>
                  </div>
                </div>
              </div>

              {/* Right region — calendar alone until a date is picked, then calendar + time-slot list. */}
              <div className="flex flex-col lg:flex-row flex-1">
                <div
                  className={
                    "p-6 sm:p-8 flex-1 border-b lg:border-b-0 border-slate-100" +
                    (selectedDate ? " lg:border-r" : "")
                  }
                >
                  <h3 className="text-base font-bold text-slate-900 mb-4">Select a Date &amp; Time</h3>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                      disabled={isCurrentMonth}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-[#f1f5f9] hover:text-[#334155] transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="font-bold text-sm text-slate-900">{monthLabel}</span>
                    <button
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-[#f1f5f9] hover:text-[#334155] transition-colors"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 mb-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((wd) => (
                      <span key={wd}>{wd}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {grid.map((d) => {
                      const inMonth = d.getMonth() === month.getMonth();
                      const disabled = !inMonth || isPastDay(d) || isWeekend(d);
                      const isToday = sameDay(d, today);
                      const isSelected = selectedDate ? sameDay(d, selectedDate) : false;
                      const dayClass = isSelected
                        ? "text-white shadow-sm"
                        : disabled
                        ? "text-[#cbd5e1] cursor-default"
                        : `bg-[#18A7B8]/10 text-[#18A7B8] hover:bg-[#18A7B8]/20${isToday ? " ring-1 ring-[#18A7B8]/50" : ""}`;
                      return (
                        <button
                          key={d.toISOString()}
                          disabled={disabled}
                          onClick={() => setSelectedDate(d)}
                          className={`h-8 w-8 mx-auto rounded-full flex items-center justify-center text-xs font-semibold transition-all ${dayClass}`}
                          style={isSelected ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)" } : undefined}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>

                  {/* Time zone — its own labeled section below the grid. The visible block is
                      purely presentational; a real (invisible) <select> sits on top of it so this
                      stays a fully working native dropdown that drives every date/time label. */}
                  <div className="mt-5">
                    <p className="text-sm font-bold text-slate-900 mb-2">Time zone</p>
                    <div className="relative">
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="flex-1 truncate">
                          {tzLongLabel(timezone)} <span className="text-slate-400">({timeLabel(new Date(), timezone)})</span>
                        </span>
                        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      </div>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        aria-label="Time zone"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      >
                        {timezoneOptions.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}{tz === detectedTimezone ? " (detected)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {selectedDate && (
                  <div className="p-6 sm:p-8 lg:w-60 flex-shrink-0">
                    <p className="text-sm font-bold text-slate-900 mb-3">
                      {dayLabel(selectedDate, timezone)}
                    </p>
                    {slots.length === 0 ? (
                      <p className="text-sm text-slate-400">No times left today — try another date.</p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {slots.map((t) => (
                          <button
                            key={t.toISOString()}
                            onClick={() => pickTime(t)}
                            className="w-full rounded-lg border border-[#18A7B8]/50 px-3 py-2 text-sm font-semibold text-[#18A7B8] hover:bg-[#18A7B8] hover:!text-white transition-colors"
                          >
                            {timeLabel(t, timezone)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
