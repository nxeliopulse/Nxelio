"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Building2, User, Lightbulb, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createAccount, updateAccount, type AccountRow } from "@/lib/queries/accounts";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn, formatDate } from "@/lib/utils";
import { PhoneInput, detectCountry, isPhoneValid, formatPhoneForStorage } from "@/components/ui/phone-input";
import type { CountryCode } from "libphonenumber-js";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";

const RATINGS = ["Hot", "Warm", "Cold"];
const OWNERSHIPS = ["Public", "Private", "Subsidiary", "Other"];
const ACCOUNT_TYPES = ["Analyst", "Competitor", "Customer", "Integrator", "Investor", "Partner", "Prospect", "Reseller", "Vendor", "Other"];
const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Consulting", "Other"];
const ACCOUNT_STATUSES = ["Active", "Inactive", "Prospect", "On Hold", "Churned"];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Australia", "India", "Germany", "France", "Japan"];

// Employees/Annual Revenue are stored as plain numbers on the account record —
// these ranges are a presentation-only bucketing (the dropdown stores the
// bucket's lower bound as the number), so no schema change was needed.
const EMPLOYEE_RANGES: { label: string; value: number }[] = [
  { label: "1-10 employees", value: 1 },
  { label: "11-50 employees", value: 11 },
  { label: "51-200 employees", value: 51 },
  { label: "201-500 employees", value: 201 },
  { label: "501-1,000 employees", value: 501 },
  { label: "1,001-5,000 employees", value: 1001 },
  { label: "5,001-10,000 employees", value: 5001 },
  { label: "10,000+ employees", value: 10001 },
];

const REVENUE_RANGES: { label: string; value: number }[] = [
  { label: "Under $1M", value: 0 },
  { label: "$1M - $5M", value: 1_000_000 },
  { label: "$5M - $10M", value: 5_000_000 },
  { label: "$10M - $50M", value: 10_000_000 },
  { label: "$50M - $100M", value: 50_000_000 },
  { label: "$100M - $500M", value: 100_000_000 },
  { label: "$500M+", value: 500_000_000 },
];

/** Maps a stored exact number back to whichever range bucket it falls in (largest boundary <= n). */
function bucketFor(ranges: { label: string; value: number }[], n: number | null): string {
  if (n == null) return "";
  let best = "";
  for (const r of ranges) {
    if (n >= r.value) best = r.label;
  }
  return best;
}

function valueForLabel(ranges: { label: string; value: number }[], label: string): number | null {
  const match = ranges.find((r) => r.label === label);
  return match ? match.value : null;
}

const STEPS = ["Account Information", "Additional Details", "Address", "Review & Save"];

const STEP_TIPS: Record<number, string> = {
  0: "Add company information to help your team better understand and engage with this account.",
  1: "These extra details help your team qualify and route this account correctly.",
  2: "Billing and shipping addresses help with invoicing and delivery coordination.",
  3: "Review everything below before saving — you can always edit these details later.",
};

export interface AccountOwnerOption {
  id: string;
  name: string;
  role: string;
}

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-500 flex items-center gap-0.5 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-900 dark:text-white text-right truncate max-w-[60%]">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

/** Deterministic color per owner name, so the sidebar avatar isn't always the same color. */
function avatarColor(name: string): string {
  const palette = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export function EditAccountModal({
  open, onClose, account, owners = [],
}: {
  open: boolean;
  onClose: () => void;
  account?: AccountRow;
  owners?: AccountOwnerOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const isEdit = Boolean(account);

  const initialForm = {
    account_owner: account?.account_owner || "",
    account_name: account?.account_name || "",
    account_site: "",
    parent_account: "",
    account_number: "",
    phone: account?.phone || "",
    fax: account?.fax || "",
    website: account?.website || "",
    domain: account?.domain || "",
    account_status: account?.account_status || "",
    industry: account?.industry || "",
    account_type: account?.account_type || "",
    annual_revenue: bucketFor(REVENUE_RANGES, account?.annual_revenue ?? null),
    employees: bucketFor(EMPLOYEE_RANGES, account?.employees ?? null),
    ownership: account?.ownership || "",
    rating: account?.rating || "",
    ticker_symbol: account?.ticker_symbol || "",
    sic_code: "",
    billing_street: account?.billing_street || "",
    billing_city: account?.billing_city || "",
    billing_state: account?.billing_state || "",
    billing_country: account?.billing_country || "",
    billing_zip: account?.billing_zip || "",
    billing_building: "",
    shipping_street: account?.shipping_street || "",
    shipping_city: account?.shipping_city || "",
    shipping_state: account?.shipping_state || "",
    shipping_country: account?.shipping_country || "",
    shipping_zip: account?.shipping_zip || "",
    shipping_building: "",
    description: account?.description || "",
  };

  const [form, setForm] = useState(initialForm);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => detectCountry(account?.phone));
  const [faxCountry, setFaxCountry] = useState<CountryCode>(() => detectCountry(account?.fax));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleClose() {
    setStep(0);
    setError(null);
    onClose();
  }

  function handleCopyAddress() {
    setForm((f) => ({
      ...f,
      shipping_country: f.billing_country,
      shipping_building: f.billing_building,
      shipping_street: f.billing_street,
      shipping_city: f.billing_city,
      shipping_state: f.billing_state,
      shipping_zip: f.billing_zip,
    }));
    toast("Billing address copied to Shipping address", "info");
  }

  function goNext() {
    if (step === 0 && !form.account_name.trim()) {
      setError("Account name is required.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSave() {
    if (!form.account_name.trim()) {
      setError("Account name is required.");
      setStep(0);
      return;
    }
    if (!isPhoneValid(form.phone, phoneCountry)) {
      setError("Phone number isn't valid for the selected country.");
      setStep(1);
      return;
    }
    if (!isPhoneValid(form.fax, faxCountry)) {
      setError("Fax number isn't valid for the selected country.");
      setStep(1);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        account_name: form.account_name.trim(),
        account_owner: form.account_owner || null,
        phone: formatPhoneForStorage(form.phone, phoneCountry) || null,
        fax: formatPhoneForStorage(form.fax, faxCountry) || null,
        website: form.website.trim() || null,
        domain: form.domain.trim() || null,
        account_status: form.account_status || null,
        industry: form.industry.trim() || null,
        account_type: form.account_type.trim() || null,
        annual_revenue: valueForLabel(REVENUE_RANGES, form.annual_revenue),
        employees: valueForLabel(EMPLOYEE_RANGES, form.employees),
        ownership: form.ownership || null,
        rating: form.rating || null,
        ticker_symbol: form.ticker_symbol.trim() || null,
        billing_street: [form.billing_building, form.billing_street].filter(Boolean).join(", ").trim() || null,
        billing_city: form.billing_city.trim() || null,
        billing_state: form.billing_state.trim() || null,
        billing_country: form.billing_country.trim() || null,
        billing_zip: form.billing_zip.trim() || null,
        shipping_street: [form.shipping_building, form.shipping_street].filter(Boolean).join(", ").trim() || null,
        shipping_city: form.shipping_city.trim() || null,
        shipping_state: form.shipping_state.trim() || null,
        shipping_country: form.shipping_country.trim() || null,
        shipping_zip: form.shipping_zip.trim() || null,
        description: form.description.trim() || null,
      };
      if (isEdit && account) {
        await updateAccount(account.id, payload);
        toast("Account updated.", "success");
      } else {
        await createAccount(payload);
        toast("Account created.", "success");
      }
      handleClose();
      router.refresh();
    } catch (err) {
      console.error("EditAccountModal save error:", err);
      toast(err instanceof Error ? err.message : "Couldn't save changes. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = "w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 dark:disabled:bg-[var(--muted)]";
  const selectStyle = "w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const { collapsed } = useSidebar();

  if (!open) return null;

  const selectedOwner = owners.find((o) => o.id === form.account_owner);

  return (
    <div
      className={cn(
        "fixed top-16 bottom-0 right-0 z-20 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden text-slate-900 dark:text-white transition-all duration-300 ease-in-out",
        collapsed ? "left-0 lg:left-[84px]" : "left-0 lg:left-[210px]"
      )}
    >
      {/* Header */}
      <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 mb-0.5">
              <button type="button" onClick={handleClose} className="hover:text-slate-600 dark:hover:text-slate-300 hover:underline">Accounts</button>
              {" "}{isEdit && account ? <>&gt; {account.account_name} </> : ""}&gt; {isEdit ? "Edit Account" : "Create Account"}
            </p>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{isEdit ? "Edit Account" : "Create New Account"}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">{isEdit ? "Update account information and details." : "Add a new account to your organization."}</p>
          </div>
          <button onClick={handleClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-700 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center mt-4">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => setStep(idx)}
                className="flex items-center gap-2 flex-shrink-0"
              >
                <span
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors",
                    idx < step ? "bg-emerald-500 text-white" : idx === step ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-[var(--muted)] text-slate-500 dark:text-slate-500"
                  )}
                >
                  {idx < step ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span className={cn("text-xs font-semibold whitespace-nowrap hidden sm:inline", idx === step ? "text-slate-900 dark:text-white" : "text-slate-400")}>
                  {label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={cn("h-px flex-1 mx-3", idx < step ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800")} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 p-6 sm:p-8 bg-white dark:bg-slate-900 w-full">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-md text-xs text-red-700 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start max-w-4xl mx-auto lg:max-w-none">
          {/* Main column — changes per step */}
          <div className="min-w-0">
            {step === 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">Account Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <FormRow label="Account Name" required>
                    <input type="text" placeholder="Enter account name" className={inputStyle} value={form.account_name} onChange={(e) => set("account_name", e.target.value)} />
                  </FormRow>
                  <FormRow label="Domain">
                    <input type="text" placeholder="example.com" className={inputStyle} value={form.domain} onChange={(e) => set("domain", e.target.value)} />
                  </FormRow>

                  <FormRow label="Website">
                    <input type="text" placeholder="www.example.com" className={inputStyle} value={form.website} onChange={(e) => set("website", e.target.value)} />
                  </FormRow>
                  <FormRow label="Employees">
                    <select className={selectStyle} value={form.employees} onChange={(e) => set("employees", e.target.value)}>
                      <option value="">Select employee range</option>
                      {EMPLOYEE_RANGES.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Industry" required>
                    <select className={selectStyle} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                      <option value="">Select industry</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="Annual Revenue">
                    <select className={selectStyle} value={form.annual_revenue} onChange={(e) => set("annual_revenue", e.target.value)}>
                      <option value="">Select revenue range</option>
                      {REVENUE_RANGES.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Account Status" required>
                    <select className={selectStyle} value={form.account_status} onChange={(e) => set("account_status", e.target.value)}>
                      <option value="">Select status</option>
                      {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="Account Type">
                    <select className={selectStyle} value={form.account_type} onChange={(e) => set("account_type", e.target.value)}>
                      <option value="">Select account type</option>
                      {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Account Owner" required>
                    <select className={selectStyle} value={form.account_owner} onChange={(e) => set("account_owner", e.target.value)}>
                      <option value="">Select owner</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      {form.account_owner && !owners.some((o) => o.name === form.account_owner) && (
                        <option value={form.account_owner}>{form.account_owner}</option>
                      )}
                    </select>
                  </FormRow>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">Additional Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <FormRow label="Rating">
                    <select className={selectStyle} value={form.rating} onChange={(e) => set("rating", e.target.value)}>
                      <option value="">-None-</option>
                      {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="Ownership">
                    <select className={selectStyle} value={form.ownership} onChange={(e) => set("ownership", e.target.value)}>
                      <option value="">-None-</option>
                      {OWNERSHIPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </FormRow>

                  <PhoneInput
                    label="Phone"
                    country={phoneCountry}
                    value={form.phone}
                    onCountryChange={setPhoneCountry}
                    onValueChange={(v) => set("phone", v)}
                    inputClassName={inputStyle}
                  />
                  <PhoneInput
                    label="Fax"
                    country={faxCountry}
                    value={form.fax}
                    onCountryChange={setFaxCountry}
                    onValueChange={(v) => set("fax", v)}
                    inputClassName={inputStyle}
                  />

                  <FormRow label="Account Site">
                    <input type="text" className={inputStyle} value={form.account_site} onChange={(e) => set("account_site", e.target.value)} />
                  </FormRow>
                  <FormRow label="Parent Account">
                    <input type="text" className={inputStyle} value={form.parent_account} onChange={(e) => set("parent_account", e.target.value)} />
                  </FormRow>

                  <FormRow label="Account Number">
                    <input type="text" className={inputStyle} value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
                  </FormRow>
                  <FormRow label="Ticker Symbol">
                    <input type="text" className={inputStyle} value={form.ticker_symbol} onChange={(e) => set("ticker_symbol", e.target.value)} />
                  </FormRow>

                  <FormRow label="SIC Code">
                    <input type="text" className={inputStyle} value={form.sic_code} onChange={(e) => set("sic_code", e.target.value)} />
                  </FormRow>

                  <div className="sm:col-span-2">
                    <FormRow label="Description">
                      <textarea
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[90px]"
                        placeholder="Add description notes..."
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                      />
                    </FormRow>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="flex items-center justify-between mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700">Address</h3>
                  <Button variant="outline" size="sm" onClick={handleCopyAddress} className="h-7 text-xs px-3 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-[var(--border)]">Copy Billing to Shipping</Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <fieldset className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 pt-3 relative bg-slate-50/30 dark:bg-slate-950/40">
                    <legend className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-600">Billing Address</legend>
                    <div className="space-y-3">
                      <FormRow label="Country / Region">
                        <LocationAutocomplete
                          type="country"
                          value={form.billing_country || ""}
                          onChange={(val) => set("billing_country", val)}
                          placeholder="Country"
                          className={selectStyle}
                        />
                      </FormRow>
                      <FormRow label="Flat / House No.">
                        <input type="text" className={inputStyle} value={form.billing_building} onChange={(e) => set("billing_building", e.target.value)} />
                      </FormRow>
                      <FormRow label="Street">
                        <input type="text" className={inputStyle} value={form.billing_street} onChange={(e) => set("billing_street", e.target.value)} />
                      </FormRow>
                      <FormRow label="City">
                        <LocationAutocomplete
                          type="city"
                          value={form.billing_city || ""}
                          onChange={(val) => set("billing_city", val)}
                          placeholder="City"
                          className={inputStyle}
                          countryContext={form.billing_country}
                          stateContext={form.billing_state}
                        />
                      </FormRow>
                      <FormRow label="State">
                        <LocationAutocomplete
                          type="state"
                          value={form.billing_state || ""}
                          onChange={(val) => set("billing_state", val)}
                          placeholder="State"
                          className={inputStyle}
                          countryContext={form.billing_country}
                        />
                      </FormRow>
                      <FormRow label="Zip Code">
                        <input type="text" className={inputStyle} value={form.billing_zip} onChange={(e) => set("billing_zip", e.target.value)} />
                      </FormRow>
                    </div>
                  </fieldset>

                  <fieldset className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 pt-3 relative bg-slate-50/30 dark:bg-slate-950/40">
                    <legend className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-600">Shipping Address</legend>
                    <div className="space-y-3">
                      <FormRow label="Country / Region">
                        <LocationAutocomplete
                          type="country"
                          value={form.shipping_country || ""}
                          onChange={(val) => set("shipping_country", val)}
                          placeholder="Country"
                          className={selectStyle}
                        />
                      </FormRow>
                      <FormRow label="Flat / House No.">
                        <input type="text" className={inputStyle} value={form.shipping_building} onChange={(e) => set("shipping_building", e.target.value)} />
                      </FormRow>
                      <FormRow label="Street">
                        <input type="text" className={inputStyle} value={form.shipping_street} onChange={(e) => set("shipping_street", e.target.value)} />
                      </FormRow>
                      <FormRow label="City">
                        <LocationAutocomplete
                          type="city"
                          value={form.shipping_city || ""}
                          onChange={(val) => set("shipping_city", val)}
                          placeholder="City"
                          className={inputStyle}
                          countryContext={form.shipping_country}
                          stateContext={form.shipping_state}
                        />
                      </FormRow>
                      <FormRow label="State">
                        <LocationAutocomplete
                          type="state"
                          value={form.shipping_state || ""}
                          onChange={(val) => set("shipping_state", val)}
                          placeholder="State"
                          className={inputStyle}
                          countryContext={form.shipping_country}
                        />
                      </FormRow>
                      <FormRow label="Zip Code">
                        <input type="text" className={inputStyle} value={form.shipping_zip} onChange={(e) => set("shipping_zip", e.target.value)} />
                      </FormRow>
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">Review &amp; Save</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Account Information</p>
                    <ReviewRow label="Account Name" value={form.account_name} />
                    <ReviewRow label="Domain" value={form.domain} />
                    <ReviewRow label="Website" value={form.website} />
                    <ReviewRow label="Employees" value={form.employees} />
                    <ReviewRow label="Industry" value={form.industry} />
                    <ReviewRow label="Annual Revenue" value={form.annual_revenue} />
                    <ReviewRow label="Account Status" value={form.account_status} />
                    <ReviewRow label="Account Type" value={form.account_type} />
                    <ReviewRow label="Account Owner" value={selectedOwner?.name || (form.account_owner ? "Unknown owner" : "")} />
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Additional Details</p>
                    <ReviewRow label="Rating" value={form.rating} />
                    <ReviewRow label="Ownership" value={form.ownership} />
                    <ReviewRow label="Phone" value={form.phone} />
                    <ReviewRow label="Account Site" value={form.account_site} />
                    <ReviewRow label="Parent Account" value={form.parent_account} />
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Address</p>
                    <ReviewRow label="Billing" value={[form.billing_street, form.billing_city, form.billing_state, form.billing_country].filter(Boolean).join(", ")} />
                    <ReviewRow label="Shipping" value={[form.shipping_street, form.shipping_city, form.shipping_state, form.shipping_country].filter(Boolean).join(", ")} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar — persistent across steps */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-3">Account Owner</p>
              {selectedOwner ? (
                <div className="flex items-center gap-2.5">
                  <span className={cn("h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", avatarColor(selectedOwner.name))}>
                    {selectedOwner.name.trim()[0]?.toUpperCase() || "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{selectedOwner.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate">{selectedOwner.role}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-full bg-slate-100 dark:bg-[var(--muted)] flex items-center justify-center text-slate-400 flex-shrink-0">
                    <User className="h-4 w-4" />
                  </span>
                  <p className="text-xs text-slate-400">No owner selected yet</p>
                </div>
              )}
            </div>

            {isEdit && account ? (
              <>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-1">Account Created</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">
                    {formatDate(account.created_at)}{account.created_by ? ` by ${account.created_by}` : ""}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-1">Last Modified</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">
                    {formatDate(account.updated_at)}{account.updated_by ? ` by ${account.updated_by}` : ""}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-700 mb-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Tips
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-500 leading-relaxed">{STEP_TIPS[step]}</p>
                <div className="mt-3 h-16 w-16 mx-auto rounded-full bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-blue-500 dark:text-blue-400" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 flex items-center justify-between bg-white dark:bg-slate-900">
        <Button variant="outline" size="sm" onClick={handleClose} disabled={saving} className="h-8 text-xs px-4">Cancel</Button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={goBack} disabled={saving} className="h-8 text-xs px-4">Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={goNext} className="h-8 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white">Next</Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Account"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
