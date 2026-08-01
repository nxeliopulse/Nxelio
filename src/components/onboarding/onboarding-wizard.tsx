"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, AlertCircle, Building2, Boxes, Users, Calendar, MapPin,
  DollarSign, Target, Receipt, Clock, Package, Swords, Mail, ExternalLink, Loader2,
  Check, Sparkles, CheckCircle2, User, Phone, Briefcase, Camera, Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { industries } from "@/lib/mock-data";
import { saveOnboarding, type OnboardingData, type OnboardingStatus } from "@/lib/queries/onboarding";
import { updateProfile } from "@/lib/queries/profile";
import { uploadAvatarImage } from "@/lib/storage/upload";
import { connectOutreachAccount, syncOutreachAccounts } from "@/lib/queries/outreach-accounts";
import { getZoomAccounts } from "@/lib/queries/zoom-accounts";
import { getCalendarAccounts } from "@/lib/queries/calendar-accounts";

const GOALS = ["Generate leads", "Book more meetings", "Grow pipeline", "Close deals faster", "Automate outreach", "Track performance"];
const SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];
const REVENUE = ["< $100K", "$100K – $1M", "$1M – $5M", "$5M – $20M", "$20M+"];
const DEAL_SIZES = ["< $1K", "$1K – $10K", "$10K – $50K", "$50K – $250K", "$250K+"];
const CYCLES = ["< 1 week", "1–4 weeks", "1–3 months", "3–6 months", "6+ months"];
const CUSTOMER_TYPES = ["B2B", "B2C", "Both"];

const STEP_TITLES = [
  { title: "Your profile", desc: "A little about you, so your team and leads know who they're talking to" },
  { title: "Company identity", desc: "Tell us about your business so Nxelio Nurture can tailor your workflow" },
  { title: "Sales context", desc: "Help us understand who you sell to and how" },
  { title: "Connect your inbox", desc: "Send and track campaigns from your own mailbox" },
];

const emptyForm: OnboardingData = {
  company_name: "", industry: "", company_size: "", founded_year: "", hq_location: "",
  annual_revenue: "", goals: [], company_description: "",
  target_customer_type: "", avg_deal_size: "", sales_cycle: "", primary_product: "", key_competitors: "",
};

// Button's outline variant carries its own real Tailwind dark: classes (for the
// logged-in dashboard's dark mode) — this page force-lights everything else via
// the .force-light-theme CSS escape hatch, but that only touches plain utility
// classes, not dark:-prefixed ones. Inline style always wins regardless, so use
// it here to keep these specific buttons readable even when html has .dark.
const LIGHT_OUTLINE_STYLE: React.CSSProperties = { background: "white", borderColor: "#e2e8f0", color: "#334155" };

function Field({ label, required, icon, children }: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10">{icon}</div>
          {children}
        </div>
      ) : children}
    </div>
  );
}

export function OnboardingWizard({ status, calendarProviderStatus, calendarConnected: calendarConnectedInitial, zoomConfigured, zoomConnected: zoomConnectedInitial }: {
  status: OnboardingStatus;
  calendarProviderStatus: { google: boolean; microsoft: boolean };
  calendarConnected: boolean;
  zoomConfigured: boolean;
  zoomConnected: boolean;
}) {
  const router = useRouter();
  const isEdit = status.completed;
  const [step, setStep] = useState(() => (!status.profileComplete ? 1 : !status.businessComplete ? 2 : 4));
  const [form, setForm] = useState<OnboardingData>(status.data ?? emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inboxStarted, setInboxStarted] = useState(false);
  const [mailboxConnected, setMailboxConnected] = useState(status.mailboxComplete);
  const [zoomConnected, setZoomConnected] = useState(zoomConnectedInitial);
  const [calendarConnected, setCalendarConnected] = useState(calendarConnectedInitial);

  // Profile step state
  const [phone, setPhone] = useState(status.profile?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(status.profile?.job_title ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(status.profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleGoal(g: string) {
    setForm((f) => ({ ...f, goals: f.goals.includes(g) ? f.goals.filter((x) => x !== g) : [...f.goals, g] }));
  }
  function setErr(msg: string) { setError(msg); return false; }

  function validateCompanyIdentity(): boolean {
    if (!form.company_name.trim()) return setErr("Company name is required.");
    if (!form.industry) return setErr("Please select your industry.");
    if (form.goals.length === 0) return setErr("Pick at least one goal.");
    setError(null);
    return true;
  }

  function validateSalesContext(): boolean {
    if (!form.target_customer_type) return setErr("Select your target customer type.");
    if (!form.primary_product.trim()) return setErr("Tell us your primary product or service.");
    setError(null);
    return true;
  }

  function pickAvatar(file: File | null) {
    setAvatarFile(file);
    setAvatarPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  // Persist each step as the user completes it (rather than waiting for the
  // final "Finish setup" click) — otherwise any interruption between here and
  // the last step (a connect-integration popup redirecting, a session hiccup)
  // wipes everything still sitting only in local React state, forcing the
  // user to redo the whole wizard even though they'd already filled it in.
  async function next() {
    if (step === 1) {
      if (!phone.trim() || !jobTitle.trim()) { setErr("Phone and job title are required."); return; }
      setError(null);
      let nextAvatarUrl = avatarUrl;
      if (avatarFile) {
        setUploadingAvatar(true);
        const fd = new FormData();
        fd.set("file", avatarFile);
        const res = await uploadAvatarImage(fd);
        setUploadingAvatar(false);
        if (!res.ok) { setError(res.error || "Couldn't upload your photo. You can skip it and add one later in Settings."); return; }
        nextAvatarUrl = res.url || null;
        setAvatarUrl(nextAvatarUrl);
      }
      setSaving(true);
      try {
        await updateProfile({ phone: phone.trim(), job_title: jobTitle.trim(), ...(nextAvatarUrl ? { avatar_url: nextAvatarUrl } : {}) });
      } catch (e) {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save your profile. Please try again.");
        return;
      }
      setSaving(false);
      setStep(2);
      return;
    }
    if (step === 2 && !validateCompanyIdentity()) return;
    if (step === 3) {
      if (!validateSalesContext()) return;
      setSaving(true);
      const res = await saveOnboarding(form);
      setSaving(false);
      if (!res.ok) { setError(res.error || "Couldn't save your company details. Please try again."); return; }
    }
    setError(null);
    setStep((s) => Math.min(4, s + 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function connectInbox() {
    setConnecting(true);
    setError(null);
    try {
      const res = await connectOutreachAccount("email", "/onboarding");
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener");
        setInboxStarted(true);
      } else if (res.error?.includes("Super Admin")) {
        setError("Ask your workspace admin to connect a mailbox to unlock the app for your team.");
      } else {
        setError(res.error || "Couldn't start the connection.");
      }
    } finally {
      setConnecting(false);
    }
  }

  // The connect popup lands in a different tab/React tree, so it can't update
  // this component's state directly — re-check on focus-regain instead (the
  // user alt-tabbing back after authorizing is the actual signal we have).
  // Covers all three optional/mandatory integrations, not just mailbox — Zoom
  // and Calendar used to only ever refresh on a full page reload.
  useEffect(() => {
    if (step !== 4 || (mailboxConnected && zoomConnected && calendarConnected)) return;
    async function onFocus() {
      if (!mailboxConnected) {
        const res = await syncOutreachAccounts();
        if (res.ok && res.count > 0) setMailboxConnected(true);
      }
      if (!zoomConnected) {
        const zoomAccounts = await getZoomAccounts();
        if (zoomAccounts.length > 0) setZoomConnected(true);
      }
      if (!calendarConnected) {
        const calendarAccounts = await getCalendarAccounts();
        if (calendarAccounts.length > 0) setCalendarConnected(true);
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [step, mailboxConnected, zoomConnected, calendarConnected]);

  async function finish() {
    if (!isEdit && !mailboxConnected) { setErr("Connect a mailbox to finish setting up your workspace."); return; }
    setSaving(true);
    setError(null);
    const [profileRes, businessRes] = await Promise.all([
      updateProfile({ phone: phone.trim(), job_title: jobTitle.trim(), ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }).then(() => ({ ok: true }) as { ok: boolean; error?: string }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't save your profile." })),
      saveOnboarding(form),
    ]);
    if (!profileRes.ok || !businessRes.ok) {
      setSaving(false);
      setError(profileRes.error || businessRes.error || "Couldn't save. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const head = STEP_TITLES[step - 1];
  const initials = (status.profile?.full_name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        {step > 1 && (
          <button onClick={back} aria-label="Back" className="mt-1 h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{head.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{head.desc}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1.5 flex-1">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-1.5 flex-1 rounded-full transition-colors bg-slate-200"
              style={n <= step ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)" } : undefined} />
          ))}
        </div>
        <span className="text-sm font-medium text-slate-400 whitespace-nowrap">Step {step} of 4</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg p-3 text-sm mb-4"
          style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Your profile ── */}
      {step === 1 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="h-5 w-5 text-slate-700" />
            <h2 className="font-semibold text-slate-900">Your profile</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 flex-shrink-0">
                {avatarPreviewUrl || avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a static asset
                  <img src={avatarPreviewUrl || avatarUrl || ""} alt="Avatar preview" className="h-24 w-24 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="h-24 w-24 rounded-full flex items-center justify-center font-bold text-2xl text-white"
                    style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                    {initials}
                  </div>
                )}
                <label
                  htmlFor="onboarding-avatar-input"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full text-white flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}
                >
                  <Camera className="h-4 w-4" />
                </label>
                <input
                  ref={avatarInputRef}
                  id="onboarding-avatar-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickAvatar(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Profile photo</p>
                <p className="text-xs text-slate-400">Optional — PNG, JPG, or GIF, up to 2MB.</p>
                {uploadingAvatar && <p className="text-xs mt-1" style={{ color: "#18A7B8" }}>Uploading…</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name">
                <Input leftIcon={<User className="h-4 w-4" />} value={status.profile?.full_name || ""} disabled />
              </Field>
              <Field label="Email">
                <Input leftIcon={<Mail className="h-4 w-4" />} value={status.profile?.email || ""} disabled />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Phone number" required icon={<Phone className="h-4 w-4" />}>
                <Input className="pl-10" placeholder="e.g. +1 555 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Job title" required icon={<Briefcase className="h-4 w-4" />}>
                <Input className="pl-10" placeholder="e.g. Head of Sales" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 2: Company identity ── */}
      {step === 2 && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="h-5 w-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Company identity</h2>
            </div>
            <div className="space-y-4">
              <Field label="Company name" required>
                <Input leftIcon={<Building2 className="h-4 w-4" />} placeholder="e.g. Acme Corp" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Industry / vertical" required icon={<Boxes className="h-4 w-4" />}>
                  <Select className="pl-10" value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                    <option value="">Select industry</option>
                    {industries.map((i) => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </Field>
                <Field label="Company size" icon={<Users className="h-4 w-4" />}>
                  <Select className="pl-10" value={form.company_size} onChange={(e) => set("company_size", e.target.value)}>
                    <option value="">Employees</option>
                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Founded year">
                  <Input leftIcon={<Calendar className="h-4 w-4" />} placeholder="e.g. 2018" value={form.founded_year} onChange={(e) => set("founded_year", e.target.value)} />
                </Field>
                <Field label="HQ location / country">
                  <Input leftIcon={<MapPin className="h-4 w-4" />} placeholder="e.g. Austin, TX, USA" value={form.hq_location} onChange={(e) => set("hq_location", e.target.value)} />
                </Field>
              </div>

              <Field label="Annual revenue range" icon={<DollarSign className="h-4 w-4" />}>
                <Select className="pl-10" value={form.annual_revenue} onChange={(e) => set("annual_revenue", e.target.value)}>
                  <option value="">Select revenue range</option>
                  {REVENUE.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Goals <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map((g) => {
                    const on = form.goals.includes(g);
                    return (
                      <button key={g} type="button" onClick={() => toggleGoal(g)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors",
                          !on && "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                        style={on ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)", color: "white" } : undefined}>
                        {on && <Check className="h-3.5 w-3.5" />}{g}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Select all that apply</p>
              </div>

              <Field label="Company description">
                <Textarea rows={3} placeholder="Briefly describe what your company does, who you serve, and what makes you different…" value={form.company_description} onChange={(e) => set("company_description", e.target.value)} />
              </Field>
            </div>
          </Card>
      )}

      {/* ── Step 3: Sales context ── */}
      {step === 3 && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Target className="h-5 w-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Sales context</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Target customer type <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_TYPES.map((t) => {
                    const on = form.target_customer_type === t;
                    return (
                      <button key={t} type="button" onClick={() => set("target_customer_type", t)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                          !on && "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                        style={on ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)", color: "white" } : undefined}>
                        {on && <Check className="h-3.5 w-3.5" />}{t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Average deal size" icon={<Receipt className="h-4 w-4" />}>
                  <Select className="pl-10" value={form.avg_deal_size} onChange={(e) => set("avg_deal_size", e.target.value)}>
                    <option value="">Select range</option>
                    {DEAL_SIZES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Typical sales cycle" icon={<Clock className="h-4 w-4" />}>
                  <Select className="pl-10" value={form.sales_cycle} onChange={(e) => set("sales_cycle", e.target.value)}>
                    <option value="">Select length</option>
                    {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Primary product / service being sold" required>
                <Input leftIcon={<Package className="h-4 w-4" />} placeholder="e.g. CRM software for small businesses" value={form.primary_product} onChange={(e) => set("primary_product", e.target.value)} />
              </Field>

              <Field label="Key competitors">
                <Input leftIcon={<Swords className="h-4 w-4" />} placeholder="e.g. HubSpot, Salesforce, Pipedrive" value={form.key_competitors} onChange={(e) => set("key_competitors", e.target.value)} />
                <p className="text-xs text-slate-400 mt-1.5">Separate multiple competitors with a comma. Nxelio Nurture uses this to surface high-intent leads.</p>
              </Field>
            </div>
          </Card>
      )}

      {/* ── Step 4: Connect inbox (mandatory on first run) ── */}
      {step === 4 && (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
              style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
              <Mail className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900">Connect your mailbox</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Send campaigns from your own Gmail or Outlook inbox for better deliverability and real reply threads.
                {isEdit && <> You can always do this later in <span className="font-medium text-slate-700">Settings → Connections</span>.</>}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {mailboxConnected ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Mailbox connected
                  </span>
                ) : (
                  <>
                    <Button variant="outline" onClick={connectInbox} disabled={connecting} style={LIGHT_OUTLINE_STYLE}>
                      {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect inbox
                    </Button>
                    {inboxStarted && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        Authorize in the new tab, then come back here.
                      </span>
                    )}
                  </>
                )}
              </div>
              {!isEdit && !mailboxConnected && (
                <p className="text-xs text-slate-400 mt-3">Connect a mailbox to finish setting up your workspace.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Optional: Calendar + Zoom (never block Finish — only the mailbox above is mandatory) ── */}
      {step === 4 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                <Calendar className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 text-sm">Calendar</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Sync availability and get real Google Meet links on your meetings.</p>
                <div className="mt-3">
                  {calendarConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Connected
                    </span>
                  ) : calendarProviderStatus.google || calendarProviderStatus.microsoft ? (
                    <div className="flex flex-wrap gap-2">
                      {calendarProviderStatus.google && (
                        <a href="/api/calendar/google/connect?next=/onboarding" target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" style={LIGHT_OUTLINE_STYLE}><ExternalLink className="h-3.5 w-3.5" /> Google Calendar</Button>
                        </a>
                      )}
                      {calendarProviderStatus.microsoft && (
                        <a href="/api/calendar/microsoft/connect?next=/onboarding" target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" style={LIGHT_OUTLINE_STYLE}><ExternalLink className="h-3.5 w-3.5" /> Outlook</Button>
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Not configured yet — you can set this up later in Settings.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                <Video className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 text-sm">Zoom</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Create real Zoom meeting links directly from your meetings.</p>
                <div className="mt-3">
                  {zoomConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Connected
                    </span>
                  ) : zoomConfigured ? (
                    <a href="/api/zoom/connect?next=/onboarding" target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" style={LIGHT_OUTLINE_STYLE}><ExternalLink className="h-3.5 w-3.5" /> Connect Zoom</Button>
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400">Not configured yet — you can set this up later in Settings.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={back} disabled={saving} style={LIGHT_OUTLINE_STYLE}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step < 4 ? (
            <Button onClick={next} disabled={saving || uploadingAvatar} className="rounded-full"
              style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
              {uploadingAvatar || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save and continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {isEdit && (
                <Button variant="ghost" onClick={() => router.push("/dashboard")} disabled={saving} style={{ color: "#334155" }}>Cancel</Button>
              )}
              <Button onClick={finish} disabled={saving || (!isEdit && !mailboxConnected)} className="rounded-full"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {isEdit ? "Saving…" : "Finishing…"}</>
                  : <><Sparkles className="h-4 w-4" /> {isEdit ? "Save changes" : "Finish setup"}</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
