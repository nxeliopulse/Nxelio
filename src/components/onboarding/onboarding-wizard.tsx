"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, AlertCircle, Building2, Boxes, MapPin,
  Target, Receipt, Clock, Package, Swords, Mail, Loader2,
  Check, Sparkles, User, Briefcase, Camera, ChevronDown, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { industries as FALLBACK_INDUSTRIES } from "@/lib/mock-data";
import { saveOnboarding, type OnboardingData, type OnboardingStatus } from "@/lib/queries/onboarding";
import { getPicklistValues } from "@/lib/queries/picklists";
import { updateProfile } from "@/lib/queries/profile";
import { uploadAvatarImage } from "@/lib/storage/upload";
import { PhoneInput, detectCountry, formatPhoneForStorage, isPhoneValid, type CountryCode } from "@/components/ui/phone-input";

const DEAL_SIZES = ["< $1K", "$1K – $10K", "$10K – $50K", "$50K – $250K", "$250K+"];
const CYCLES = ["< 1 week", "1–4 weeks", "1–3 months", "3–6 months", "6+ months"];
const CUSTOMER_TYPES = ["B2B", "B2C", "Both"];

const STEP_TITLES = [
  { title: "Your profile", desc: "A little about you, so your team and leads know who they're talking to" },
  { title: "Company identity", desc: "Tell us about your business so Nxelio Nurture can tailor your workflow" },
  { title: "Sales context", desc: "Help us understand who you sell to and how" },
];

const emptyForm: OnboardingData = {
  company_name: "", industry: "", company_size: "", founded_year: "", hq_location: "",
  annual_revenue: "", goals: [], company_description: "",
  target_customer_type: "", avg_deal_size: "", sales_cycle: "", primary_product: "", key_competitors: "",
};

const LIGHT_OUTLINE_STYLE: React.CSSProperties = { background: "white", borderColor: "#e2e8f0", color: "#334155" };

function Stepper({ step, titles }: { step: number; titles: string[] }) {
  return (
    <div className="grid mb-6" style={{ gridTemplateColumns: `repeat(${titles.length}, 1fr)` }}>
      {titles.map((title, i) => {
        const idx = i + 1;
        const done = idx < step;
        const current = idx === step;
        return (
          <div key={title} className="relative flex flex-col items-center text-center px-1">
            {i > 0 && (
              <div
                className="absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2"
                style={{ background: idx <= step ? "linear-gradient(90deg,#18A7B8,#7E57C2)" : "#e2e8f0" }}
              />
            )}
            <div
              className="relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0"
              style={
                done
                  ? { background: "linear-gradient(135deg,#18A7B8,#7E57C2)", borderColor: "transparent", color: "white" }
                  : current
                  ? { borderColor: "#18A7B8", color: "#18A7B8", background: "white" }
                  : { borderColor: "#e2e8f0", color: "#94a3b8", background: "white" }
              }
            >
              {done ? <Check className="h-4 w-4" /> : idx}
            </div>
            <span className={cn("relative z-10 mt-1.5 text-[11px] font-medium leading-tight bg-white px-1", (done || current) ? "text-slate-700" : "text-slate-400")}>
              {title}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

interface SelectCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxListHeight: number;
}

/** Searchable, creatable dropdown (search a fixed list, or type your own
 *  value if it isn't there) — used for Industry so a value not in our
 *  picklist doesn't force the user into a generic "Other" bucket. Rendered
 *  through a portal at the trigger's own screen coordinates rather than
 *  absolutely inside the form column, so it isn't clipped by the column's
 *  own scroll container (same fix as the phone country dropdown). */
function SearchableSelect({
  value, onChange, options, placeholder = "Select…", searchPlaceholder = "Search…", icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<SelectCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function updateCoords() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    setCoords({
      left: rect.left,
      width: rect.width,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4, maxListHeight: Math.max(120, Math.min(240, spaceAbove - 56)) }
        : { top: rect.bottom + 4, maxListHeight: Math.max(120, Math.min(240, spaceBelow - 56)) }),
    });
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() { updateCoords(); }
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) { setQuery(""); updateCoords(); requestAnimationFrame(() => searchRef.current?.focus()); }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? options.filter((o) => o.toLowerCase().includes(q)) : options), [options, q]);
  const exactMatch = options.some((o) => o.toLowerCase() === q);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={toggleOpen}
        className="peer w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-left transition hover:border-slate-350 focus:outline-none focus:ring-1 focus:ring-indigo-600/35 focus:border-indigo-600 flex items-center justify-between"
      >
        <span className={cn("truncate", value ? "text-slate-900" : "text-slate-400")}>{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
      </button>
      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden"
          style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom }}
        >
          <div className="p-2 border-b border-slate-100">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-600/35 focus:border-indigo-600"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: coords.maxListHeight }}>
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={cn("w-full flex items-center px-3 py-1.5 text-sm text-left hover:bg-slate-50", o === value && "bg-indigo-50 text-indigo-700")}
              >
                {o}
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => { onChange(query.trim()); setOpen(false); }}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-left text-indigo-600 hover:bg-indigo-50 border-t border-slate-100"
              >
                <Plus className="h-3.5 w-3.5" /> Use &quot;{query.trim()}&quot;
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No options</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function OnboardingWizard({ status }: {
  status: OnboardingStatus;
}) {
  const router = useRouter();
  const isEdit = status.completed;
  const [step, setStep] = useState(() => (!status.profileComplete ? 1 : !status.businessComplete ? 2 : 3));
  const [form, setForm] = useState<OnboardingData>(status.data ?? emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [industries, setIndustries] = useState(FALLBACK_INDUSTRIES);
  useEffect(() => { getPicklistValues("lead_industry").then(setIndustries).catch(() => {}); }, []);
  const [saving, setSaving] = useState(false);

  // Profile step state
  const [phone, setPhone] = useState(status.profile?.phone ?? "");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => detectCountry(status.profile?.phone));
  const [jobTitle, setJobTitle] = useState(status.profile?.job_title ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(status.profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setErr(msg: string) { setError(msg); return false; }

  function validateCompanyIdentity(): boolean {
    if (!form.company_name.trim()) return setErr("Company name is required.");
    if (!form.industry) return setErr("Please select your industry.");
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
      if (!isPhoneValid(phone, phoneCountry)) { setErr("Phone number isn't valid for the selected country."); return; }
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
        await updateProfile({ phone: formatPhoneForStorage(phone, phoneCountry), job_title: jobTitle.trim(), ...(nextAvatarUrl ? { avatar_url: nextAvatarUrl } : {}) });
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
    setError(null);
    setStep((s) => Math.min(3, s + 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function finish() {
    if (!validateSalesContext()) return;
    if (!isPhoneValid(phone, phoneCountry)) { setErr("Phone number isn't valid for the selected country."); return; }
    setSaving(true);
    setError(null);
    const [profileRes, businessRes] = await Promise.all([
      updateProfile({ phone: formatPhoneForStorage(phone, phoneCountry), job_title: jobTitle.trim(), ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }).then(() => ({ ok: true }) as { ok: boolean; error?: string }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't save your profile." })),
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
      {/* Brand logo & Account identity strip inline header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <Logo />
        {status.profile && (
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-1.5 pr-3.5 py-1.5 flex-shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a static asset
              <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)" }}>
                {initials}
              </div>
            )}
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-800">{status.profile.full_name || "—"}</p>
              <p className="text-[11px] text-slate-400">{status.profile.email}</p>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-2.5">
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
      <Stepper step={step} titles={STEP_TITLES.map((t) => t.title)} />

      {error && (
        <div className="flex items-start gap-2 rounded-lg p-3 text-sm mb-3"
          style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Your profile ── */}
      {step === 1 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
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
              <Field label="Phone number" required>
                <PhoneInput label="" country={phoneCountry} value={phone} onCountryChange={setPhoneCountry} onValueChange={setPhone} required />
              </Field>
              <Field label="Job title" required icon={<Briefcase className="h-4 w-4" />}>
                <Input className="pl-10" placeholder="e.g. Head of Sales" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Company identity ── */}
      {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Company identity</h2>
            </div>
            <div className="space-y-4">
              <Field label="Company name" required>
                <Input leftIcon={<Building2 className="h-4 w-4" />} placeholder="e.g. Acme Corp" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              </Field>

              <Field label="Industry / vertical" required icon={<Boxes className="h-4 w-4" />}>
                <SearchableSelect
                  value={form.industry}
                  onChange={(v) => set("industry", v)}
                  options={industries}
                  placeholder="Select industry"
                  searchPlaceholder="Search your industry…"
                />
              </Field>

              <Field label="HQ location / country">
                <Input leftIcon={<MapPin className="h-4 w-4" />} placeholder="e.g. Austin, TX, USA" value={form.hq_location} onChange={(e) => set("hq_location", e.target.value)} />
              </Field>

              <Field label="Company description">
                <Textarea rows={3} placeholder="Briefly describe what your company does, who you serve, and what makes you different…" value={form.company_description} onChange={(e) => set("company_description", e.target.value)} />
              </Field>
            </div>
          </div>
      )}

      {/* ── Step 3: Sales context ── */}
      {step === 3 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
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
          </div>
      )}


      {/* Footer nav */}
      <div className="flex items-center justify-between mt-4">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={back} disabled={saving} style={LIGHT_OUTLINE_STYLE}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button onClick={next} disabled={saving || uploadingAvatar} className="rounded-full"
              style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
              {uploadingAvatar || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save and continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {isEdit && (
                <Button variant="ghost" onClick={() => router.push("/dashboard")} disabled={saving} style={{ color: "#334155" }}>Cancel</Button>
              )}
              <Button onClick={finish} disabled={saving} className="rounded-full"
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
