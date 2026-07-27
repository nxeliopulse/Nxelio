"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, AlertCircle, Building2, Boxes, Users, Calendar, MapPin,
  DollarSign, Target, Receipt, Clock, Package, Swords, Mail, ExternalLink, Loader2,
  Check, Sparkles, CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { industries } from "@/lib/mock-data";
import { saveOnboarding, type OnboardingData } from "@/lib/queries/onboarding";
import { connectOutreachAccount } from "@/lib/queries/outreach-accounts";

const GOALS = ["Generate leads", "Book more meetings", "Grow pipeline", "Close deals faster", "Automate outreach", "Track performance"];
const SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];
const REVENUE = ["< $100K", "$100K – $1M", "$1M – $5M", "$5M – $20M", "$20M+"];
const DEAL_SIZES = ["< $1K", "$1K – $10K", "$10K – $50K", "$50K – $250K", "$250K+"];
const CYCLES = ["< 1 week", "1–4 weeks", "1–3 months", "3–6 months", "6+ months"];
const CUSTOMER_TYPES = ["B2B", "B2C", "Both"];

const STEP_TITLES = [
  { title: "Essentials setup", desc: "Tell us about your business so Nxelio Nurture can tailor your workflow" },
  { title: "Connect your inbox", desc: "Send and track campaigns from your own mailbox (optional)" },
];

const emptyForm: OnboardingData = {
  company_name: "", industry: "", company_size: "", founded_year: "", hq_location: "",
  annual_revenue: "", goals: [], company_description: "",
  target_customer_type: "", avg_deal_size: "", sales_cycle: "", primary_product: "", key_competitors: "",
};

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

export function OnboardingWizard({ initial, isEdit }: { initial?: OnboardingData | null; isEdit?: boolean } = {}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingData>(initial ?? emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inboxStarted, setInboxStarted] = useState(false);

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleGoal(g: string) {
    setForm((f) => ({ ...f, goals: f.goals.includes(g) ? f.goals.filter((x) => x !== g) : [...f.goals, g] }));
  }

  function validateStep1(): boolean {
    if (!form.company_name.trim()) return setErr("Company name is required.");
    if (!form.industry) return setErr("Please select your industry.");
    if (form.goals.length === 0) return setErr("Pick at least one goal.");
    if (!form.target_customer_type) return setErr("Select your target customer type.");
    if (!form.primary_product.trim()) return setErr("Tell us your primary product or service.");
    setError(null);
    return true;
  }
  function setErr(msg: string) { setError(msg); return false; }

  function next() {
    if (step === 1 && !validateStep1()) return;
    setError(null);
    setStep((s) => Math.min(2, s + 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function connectInbox() {
    setConnecting(true);
    try {
      const res = await connectOutreachAccount("email");
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener");
        setInboxStarted(true);
      } else {
        setError(res.error || "Couldn't start the connection. You can do this later in Settings.");
      }
    } finally {
      setConnecting(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    const res = await saveOnboarding(form);
    if (!res.ok) {
      setSaving(false);
      setError(res.error || "Couldn't save. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const head = STEP_TITLES[step - 1];

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
          {[1, 2].map((n) => (
            <div key={n} className={cn("h-1.5 flex-1 rounded-full transition-colors", n <= step ? "bg-blue-600" : "bg-slate-200")} />
          ))}
        </div>
        <span className="text-sm font-medium text-slate-400 whitespace-nowrap">Step {step} of 2</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Essentials ── */}
      {step === 1 && (
        <div className="space-y-4">
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
                      <button key={g} type="button" onClick={() => toggleGoal(g)} className={cn(
                        "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors",
                        on ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}>
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
                      <button key={t} type="button" onClick={() => set("target_customer_type", t)} className={cn(
                        "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                        on ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}>
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
        </div>
      )}

      {/* ── Step 2: Connect inbox ── */}
      {step === 2 && (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900">Connect your mailbox</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Send campaigns from your own Gmail or Outlook inbox for better deliverability and real reply threads. You can always do this later in <span className="font-medium text-slate-700">Settings → Connections</span>.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={connectInbox} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect inbox
                </Button>
                {inboxStarted && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Authorize in the new tab, then continue.
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={back} disabled={saving}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step === 1 ? (
            <Button onClick={next} disabled={saving}>
              Save and continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => (isEdit ? router.push("/dashboard") : finish())} disabled={saving}>{isEdit ? "Cancel" : "Skip for now"}</Button>
              <Button onClick={finish} disabled={saving}>
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
