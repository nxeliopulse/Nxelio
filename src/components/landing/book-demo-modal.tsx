"use client";
import { useEffect, useState, useTransition } from "react";
import { X, CalendarDays, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { submitDemoRequest } from "@/lib/queries/demo-request";
import { PhoneInput, formatPhoneForStorage } from "@/components/ui/phone-input";
import type { CountryCode } from "libphonenumber-js";

const INDUSTRIES = ["SaaS", "E-commerce", "Healthcare", "Finance", "Manufacturing", "Real Estate", "Education", "Other"];
const EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-500", "500+"];
const REVENUE_BANDS = ["Under $10k", "$10k - $50k", "$50k - $250k", "$250k - $1M", "$1M+"];
const REFERRAL_SOURCES = ["Google Search", "LinkedIn", "Referral", "Twitter / X", "Other"];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const EMPTY_FORM = {
  fullName: "", businessEmail: "", phone: "", industry: "",
  employeeCount: "", monthlyRevenue: "", purpose: "", referralSource: "",
  date: "", hour: "10", minute: "00", meridiem: "AM" as "AM" | "PM",
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-400";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

export function BookDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>("US");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ formattedDate: string; formattedTime: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function reset() {
    setForm(EMPTY_FORM);
    setPhoneCountry("US");
    setError(null);
    setDone(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submit() {
    setError(null);
    if (!form.fullName.trim()) return setError("Please enter your name.");
    if (!form.businessEmail.includes("@")) return setError("Please enter a valid business email.");
    if (!form.phone.trim()) return setError("Please enter your phone number.");
    if (!form.industry) return setError("Please select your industry.");
    if (!form.employeeCount) return setError("Please select your number of employees.");
    if (!form.monthlyRevenue) return setError("Please select your monthly revenue.");
    if (!form.date) return setError("Please pick an available date.");

    start(async () => {
      const res = await submitDemoRequest({ ...form, phone: formatPhoneForStorage(form.phone, phoneCountry) });
      if (!res.ok) { setError(res.error || "Couldn't book that time. Please try again."); return; }
      setDone({ formattedDate: res.formattedDate!, formattedTime: res.formattedTime! });
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="no-scrollbar relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900">You&apos;re booked!</h2>
            <p className="mt-3 text-slate-600">
              Your Nxelio Nurture demo is confirmed for
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {done.formattedDate} at {done.formattedTime}
            </p>
            <p className="mt-4 text-sm text-slate-500">
              A confirmation with your meeting link is on its way to {form.businessEmail}.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="mb-6 text-center">
              <div
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white mb-3"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
              >
                <CalendarDays className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Book a demo</h2>
              <p className="text-slate-500 mt-1 text-sm">Tell us a bit about your business and pick a time that works for you.</p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Full name *</label>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Jane Doe" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Business email *</label>
                  <input type="email" value={form.businessEmail} onChange={(e) => setForm({ ...form, businessEmail: e.target.value })} placeholder="you@company.com" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone number *</label>
                  <PhoneInput label="" country={phoneCountry} value={form.phone} onCountryChange={setPhoneCountry} onValueChange={(v) => setForm({ ...form, phone: v })} inputClassName={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Working industry *</label>
                  <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={inputClass}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Number of employees *</label>
                  <select value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: e.target.value })} className={inputClass}>
                    <option value="">Select range</option>
                    {EMPLOYEE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Company&apos;s monthly revenue *</label>
                  <select value={form.monthlyRevenue} onChange={(e) => setForm({ ...form, monthlyRevenue: e.target.value })} className={inputClass}>
                    <option value="">Select range</option>
                    {REVENUE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Purpose of the demo</label>
                <textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="What would you like to see?" className={`${inputClass} resize-none`} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>How did you hear about us?</label>
                  <select value={form.referralSource} onChange={(e) => setForm({ ...form, referralSource: e.target.value })} className={inputClass}>
                    <option value="">Select an option</option>
                    {REFERRAL_SOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Available date *</label>
                  <input type="date" min={todayStr()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Available time *</label>
                <div className="grid grid-cols-3 gap-4">
                  <select value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })} className={inputClass}>
                    {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={form.minute} onChange={(e) => setForm({ ...form, minute: e.target.value })} className={inputClass}>
                    {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={form.meridiem} onChange={(e) => setForm({ ...form, meridiem: e.target.value as "AM" | "PM" })} className={inputClass}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <button
                onClick={submit}
                disabled={pending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
              >
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : "Book Demo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
