"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Building2, User, Search, Info, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createAccount, updateAccount, type AccountRow } from "@/lib/queries/accounts";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn } from "@/lib/utils";

const RATINGS = ["Hot", "Warm", "Cold"];
const OWNERSHIPS = ["Public", "Private", "Subsidiary", "Other"];
const ACCOUNT_TYPES = ["Analyst", "Competitor", "Customer", "Integrator", "Investor", "Partner", "Prospect", "Reseller", "Vendor", "Other"];
const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Consulting", "Other"];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Australia", "India", "Germany", "France", "Japan"];

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-500 text-right whitespace-nowrap truncate" title={label}>
        {label}
      </label>
      <div className="relative flex items-center w-full">
        {required && <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-md z-10" />}
        {children}
      </div>
    </div>
  );
}

export function EditAccountModal({ open, onClose, account }: { open: boolean; onClose: () => void; account?: AccountRow }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const isEdit = Boolean(account);

  const initialForm = {
    account_owner: "Hari",
    account_name: account?.account_name || "",
    account_site: "",
    parent_account: "",
    account_number: "",
    phone: account?.phone || "",
    fax: "",
    website: account?.website || "",
    industry: account?.industry || "",
    account_type: account?.account_type || "",
    annual_revenue: account?.annual_revenue != null ? String(account.annual_revenue) : "",
    employees: account?.employees != null ? String(account.employees) : "",
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function handleSave(andNew = false) {
    if (!form.account_name.trim()) {
      setError("Account name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        account_name: form.account_name.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
        account_type: form.account_type.trim() || null,
        annual_revenue: form.annual_revenue.trim() ? Number(form.annual_revenue) : null,
        employees: form.employees.trim() ? Number(form.employees) : null,
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
      if (andNew) {
        setForm(initialForm);
        toast("Account saved — ready for new entry", "success");
      } else {
        onClose();
      }
      router.refresh();
    } catch {
      toast("Couldn't save changes. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = "w-full h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 dark:disabled:bg-[var(--muted)]";
  const selectStyle = "w-full h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-7";
  const { collapsed } = useSidebar();

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed top-16 bottom-0 right-0 z-20 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden text-slate-900 dark:text-white transition-all duration-300 ease-in-out",
        collapsed ? "left-0 lg:left-[84px]" : "left-0 lg:left-[210px]"
      )}
    >
      {/* Subheader Action Bar */}
      <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{isEdit ? "Edit Account" : "Create Account"}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-7 text-xs px-3">Cancel</Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving} className="h-7 text-xs px-3">Save and New</Button>
          <Button size="sm" onClick={() => handleSave(false)} disabled={saving} className="h-7 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium">Save</Button>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-700 p-1 ml-2">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="overflow-auto flex-1 p-6 sm:p-8 space-y-8 bg-white dark:bg-slate-900 w-full">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-md text-xs text-red-700 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Account Image */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-3">Account Image</h3>
          <div className="h-16 w-16 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--muted)] flex items-center justify-center text-slate-300 dark:text-slate-600">
            <Building2 className="h-8 w-8" />
          </div>
        </div>

        {/* Account Information */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">Account Information</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-3">
            {/* Left Column */}
            <FormRow label="Account Owner">
              <div className="relative w-full">
                <select className={selectStyle} value={form.account_owner} onChange={(e) => set("account_owner", e.target.value)}>
                  <option value="Hari">Hari</option>
                </select>
                <div className="absolute right-2 top-1.5 pointer-events-none text-slate-400 bg-slate-100 dark:bg-[var(--muted)] p-0.5 rounded border border-slate-200 dark:border-slate-700">
                  <User className="h-3 w-3" />
                </div>
              </div>
            </FormRow>

            <FormRow label="Rating">
              <select className={selectStyle} value={form.rating} onChange={(e) => set("rating", e.target.value)}>
                <option value="">-None-</option>
                {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </FormRow>

            <FormRow label="Account Name" required>
              <input type="text" className={inputStyle} value={form.account_name} onChange={(e) => set("account_name", e.target.value)} />
            </FormRow>

            <FormRow label="Phone">
              <input type="text" className={inputStyle} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </FormRow>

            <FormRow label="Account Site">
              <input type="text" className={inputStyle} value={form.account_site} onChange={(e) => set("account_site", e.target.value)} />
            </FormRow>

            <FormRow label="Fax">
              <input type="text" className={inputStyle} value={form.fax} onChange={(e) => set("fax", e.target.value)} />
            </FormRow>

            <FormRow label="Parent Account">
              <div className="relative w-full">
                <input type="text" className={inputStyle + " pr-7"} value={form.parent_account} onChange={(e) => set("parent_account", e.target.value)} />
                <div className="absolute right-2 top-1.5 text-slate-400 bg-slate-100 dark:bg-[var(--muted)] p-0.5 rounded border border-slate-200 dark:border-slate-700">
                  <Building2 className="h-3 w-3" />
                </div>
              </div>
            </FormRow>

            <FormRow label="Website">
              <input type="text" className={inputStyle} value={form.website} onChange={(e) => set("website", e.target.value)} />
            </FormRow>

            <FormRow label="Account Number">
              <input type="text" className={inputStyle} value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
            </FormRow>

            <FormRow label="Ticker Symbol">
              <input type="text" className={inputStyle} value={form.ticker_symbol} onChange={(e) => set("ticker_symbol", e.target.value)} />
            </FormRow>

            <FormRow label="Account Type">
              <select className={selectStyle} value={form.account_type} onChange={(e) => set("account_type", e.target.value)}>
                <option value="">-None-</option>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormRow>

            <FormRow label="Ownership">
              <select className={selectStyle} value={form.ownership} onChange={(e) => set("ownership", e.target.value)}>
                <option value="">-None-</option>
                {OWNERSHIPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormRow>

            <FormRow label="Industry">
              <select className={selectStyle} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                <option value="">-None-</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </FormRow>

            <FormRow label="Employees">
              <input type="number" className={inputStyle} value={form.employees} onChange={(e) => set("employees", e.target.value)} />
            </FormRow>

            <FormRow label="Annual Revenue">
              <div className="relative w-full flex items-center">
                <span className="absolute left-2 text-slate-400 text-xs">$</span>
                <input type="text" className={inputStyle + " pl-5 pr-7"} value={form.annual_revenue} onChange={(e) => set("annual_revenue", e.target.value)} />
                <Info className="h-3.5 w-3.5 absolute right-2 text-slate-400" />
              </div>
            </FormRow>

            <FormRow label="SIC Code">
              <input type="text" className={inputStyle} value={form.sic_code} onChange={(e) => set("sic_code", e.target.value)} />
            </FormRow>
          </div>
        </div>

        {/* Address Information */}
        <div>
          <div className="flex items-center justify-between mb-4 pb-1 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-700">Address Information</h3>
            <Button variant="outline" size="sm" onClick={handleCopyAddress} className="h-7 text-xs px-3 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-[var(--border)]">Copy Address</Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Billing Address Box */}
            <fieldset className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 pt-3 relative bg-slate-50/30 dark:bg-slate-950/40">
              <legend className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-600">Billing Address</legend>
              <div className="space-y-3">
                <FormRow label="Country / Region">
                  <select className={selectStyle} value={form.billing_country} onChange={(e) => set("billing_country", e.target.value)}>
                    <option value="">-None-</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Flat / House No.">
                  <input type="text" className={inputStyle} value={form.billing_building} onChange={(e) => set("billing_building", e.target.value)} />
                </FormRow>
                <FormRow label="Street">
                  <input type="text" className={inputStyle} value={form.billing_street} onChange={(e) => set("billing_street", e.target.value)} />
                </FormRow>
                <FormRow label="City">
                  <input type="text" className={inputStyle} value={form.billing_city} onChange={(e) => set("billing_city", e.target.value)} />
                </FormRow>
                <FormRow label="State">
                  <input type="text" className={inputStyle} value={form.billing_state} onChange={(e) => set("billing_state", e.target.value)} />
                </FormRow>
                <FormRow label="Zip Code">
                  <input type="text" className={inputStyle} value={form.billing_zip} onChange={(e) => set("billing_zip", e.target.value)} />
                </FormRow>
              </div>
            </fieldset>

            {/* Shipping Address Box */}
            <fieldset className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 pt-3 relative bg-slate-50/30 dark:bg-slate-950/40">
              <legend className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-600">Shipping Address</legend>
              <div className="space-y-3">
                <FormRow label="Country / Region">
                  <select className={selectStyle} value={form.shipping_country} onChange={(e) => set("shipping_country", e.target.value)}>
                    <option value="">-None-</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Flat / House No.">
                  <input type="text" className={inputStyle} value={form.shipping_building} onChange={(e) => set("shipping_building", e.target.value)} />
                </FormRow>
                <FormRow label="Street">
                  <input type="text" className={inputStyle} value={form.shipping_street} onChange={(e) => set("shipping_street", e.target.value)} />
                </FormRow>
                <FormRow label="City">
                  <input type="text" className={inputStyle} value={form.shipping_city} onChange={(e) => set("shipping_city", e.target.value)} />
                </FormRow>
                <FormRow label="State">
                  <input type="text" className={inputStyle} value={form.shipping_state} onChange={(e) => set("shipping_state", e.target.value)} />
                </FormRow>
                <FormRow label="Zip Code">
                  <input type="text" className={inputStyle} value={form.shipping_zip} onChange={(e) => set("shipping_zip", e.target.value)} />
                </FormRow>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Description Information */}
        <div className="pt-2">
          <h3 className="text-xs font-bold text-slate-800 mb-3 pb-1 border-b border-slate-100">Description Information</h3>
          <textarea className="w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[90px]" placeholder="Add description notes..." value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
