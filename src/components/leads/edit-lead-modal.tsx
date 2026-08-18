"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { X, User, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { updateLead, updateLeadStatus, findLeadByPhone, type LeadRow } from "@/lib/queries/leads";
import { industries as FALLBACK_INDUSTRIES, interestAreas as FALLBACK_INTEREST_AREAS } from "@/lib/mock-data";
import { getPicklistValues } from "@/lib/queries/picklists";
import { useLeadInActiveCampaign } from "@/lib/leads/use-lead-in-active-campaign";
import { allowedNextStatuses } from "@/lib/leads/status-flow";
import { isSuperAdmin } from "@/lib/queries/auth-guards";
import { PhoneInput, detectCountry, formatPhoneForStorage, isPhoneValid } from "@/components/ui/phone-input";
import type { CountryCode } from "libphonenumber-js";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { isValidEmail, isValidWebsite, EMAIL_ERROR, WEBSITE_ERROR } from "@/lib/validation";

const FALLBACK_COMPANY_SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const FALLBACK_SENIORITY_LEVELS = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"];

export function EditLeadModal({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: LeadRow }) {
  const router = useRouter();
  const { toast, prompt } = useFeedback();
  const campaignLocked = useLeadInActiveCampaign(lead.id);
  // "Converted" is a dead end — nothing may change a lead's status manually
  // once it's converted (only the Convert button sets that value, and it
  // never sets it back). See src/lib/leads/status-flow.ts.
  const statusDeadEnd = lead.status === "Converted";
  const statusLocked = campaignLocked || statusDeadEnd;
  // The dropdown shows the current status plus whatever it's allowed to move
  // to next — never "Converted" (that's only ever set by the Convert flow),
  // never an arbitrary jump (e.g. New straight to Qualified).
  const statusOptions = [lead.status, ...allowedNextStatuses(lead.status)].filter((s, i, arr) => s && arr.indexOf(s) === i);
  const [amSuperAdmin, setAmSuperAdmin] = useState(false);
  useEffect(() => { isSuperAdmin().then(setAmSuperAdmin).catch(() => {}); }, []);
  const lockedFields = lead.locked_fields ?? {};
  const fieldLocked = (field: string) => Boolean(lockedFields[field]) && !amSuperAdmin;
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => detectCountry(lead.phone));
  const [form, setForm] = useState({
    full_name: lead.full_name || "",
    company_name: lead.company_name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    website_url: lead.website_url || "",
    linkedin: lead.linkedin || "",
    industry: lead.industry || "",
    interest_area: lead.interest_area || "",
    status: lead.status || "New",
    job_title: lead.job_title || "",
    seniority: lead.seniority || "",
    company_size: lead.company_size || "",
    twitter_handle: lead.twitter_handle || "",
    street_address: lead.street_address || "",
    city: lead.city || "",
    state: lead.state || "",
    country: lead.country || "",
    postal_code: lead.postal_code || "",
    message: lead.message || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [industries, setIndustries] = useState(FALLBACK_INDUSTRIES);
  const [interestAreas, setInterestAreas] = useState(FALLBACK_INTEREST_AREAS);
  const [companySizeBuckets, setCompanySizeBuckets] = useState(FALLBACK_COMPANY_SIZE_BUCKETS);
  const [seniorityLevels, setSeniorityLevels] = useState(FALLBACK_SENIORITY_LEVELS);

  useEffect(() => {
    getPicklistValues("lead_industry").then(setIndustries).catch(() => {});
    getPicklistValues("lead_interest_area").then(setInterestAreas).catch(() => {});
    getPicklistValues("lead_company_size").then(setCompanySizeBuckets).catch(() => {});
    getPicklistValues("lead_seniority").then(setSeniorityLevels).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.full_name.trim() && !form.company_name.trim()) {
      setError("A name or company is required.");
      return;
    }
    if (!form.email.trim() && !form.website_url.trim() && !form.linkedin.trim()) {
      setError("At least one of Email, Website, or LinkedIn is required.");
      return;
    }
    if (!isValidEmail(form.email)) { setError(EMAIL_ERROR); return; }
    if (!isValidWebsite(form.website_url)) { setError(WEBSITE_ERROR); return; }
    if (!isPhoneValid(form.phone, phoneCountry)) {
      setError("Phone number isn't valid for the selected country.");
      return;
    }

    const normalizedPhone = form.phone.trim() ? formatPhoneForStorage(form.phone, phoneCountry) : null;
    if (normalizedPhone && normalizedPhone !== lead.phone) {
      const conflict = await findLeadByPhone(normalizedPhone, lead.id);
      if (conflict) {
        toast(
          `This phone number is already used by another lead${conflict.full_name ? ` (${conflict.full_name})` : ""}. You cannot use the same phone number for two leads.`,
          "error"
        );
        return;
      }
    }

    // Status changes need a reason, logged separately from the rest of the
    // form — collect it before touching anything, so canceling here aborts
    // the whole save rather than silently dropping just the status change.
    const statusChanged = form.status !== lead.status;
    let statusReason: string | null = null;
    if (statusChanged) {
      statusReason = await prompt({
        title: `Change status to "${form.status}"?`,
        message: "Add a short reason for this change — it's saved to this lead's activity history.",
        label: "Reason",
        placeholder: "e.g. Replied to outreach and asked for a demo",
        confirmLabel: "Update status",
        required: true,
      });
      if (statusReason === null) return; // canceled — abort the whole save
    }

    setError(null);
    setSaving(true);
    try {
      await updateLead(lead.id, {
        full_name: form.full_name.trim() || null,
        company_name: form.company_name.trim() || null,
        email: form.email.trim() || null,
        phone: normalizedPhone,
        website_url: form.website_url.trim() || null,
        linkedin: form.linkedin.trim() || null,
        industry: form.industry || null,
        interest_area: form.interest_area || null,
        job_title: form.job_title.trim() || null,
        seniority: form.seniority || null,
        company_size: form.company_size || null,
        twitter_handle: form.twitter_handle.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        postal_code: form.postal_code.trim() || null,
        message: form.message.trim() || null,
      });
      if (statusChanged && statusReason) {
        await updateLeadStatus(lead.id, form.status, statusReason);
      }
      toast("Lead updated successfully.", "success");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] transition";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="lp-anim-fade fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Centered dialog */}
      <div className="lp-anim-scale relative w-full sm:w-[720px] max-w-[95vw] max-h-[90vh] bg-white dark:bg-slate-950 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-850 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
              <User className="h-4.5 w-4.5 text-[#18A7B8]" /> Edit Prospect
            </h2>
            <p className="text-[10px] text-slate-450 mt-1 uppercase tracking-wider font-bold">Update details for {lead.full_name || lead.company_name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg p-1.5 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4 pr-3.5">
          {error && (
            <p className="text-xs font-bold text-red-650 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-150 dark:border-red-900/50">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <Input label="Name *" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Full Name" />
            <Input label="Company *" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Company Name" />
            
            <div>
              <Input
                type="email"
                label="Email *"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="email@example.com"
                disabled={fieldLocked("email")}
                title={fieldLocked("email") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              />
              {fieldLocked("email") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            
            <div>
              <fieldset disabled={fieldLocked("phone")} title={fieldLocked("phone") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}>
                <PhoneInput
                  label="Phone *"
                  country={phoneCountry}
                  value={form.phone}
                  onCountryChange={setPhoneCountry}
                  onValueChange={(v) => set("phone", v)}
                  inputClassName={fieldStyle}
                />
              </fieldset>
              {fieldLocked("phone") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            
            <Input label="Website" value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://example.com" />
            
            <div>
              <Input
                label="LinkedIn"
                value={form.linkedin}
                onChange={(e) => set("linkedin", e.target.value)}
                placeholder="LinkedIn Profile URL"
                disabled={fieldLocked("linkedin")}
                title={fieldLocked("linkedin") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              />
              {fieldLocked("linkedin") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            
            <div>
              <Select
                label="Industry"
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                disabled={fieldLocked("industry")}
                title={fieldLocked("industry") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              >
                <option value="">— Choose Industry —</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
              {fieldLocked("industry") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            
            <Select label="Interest Area" value={form.interest_area} onChange={(e) => set("interest_area", e.target.value)}>
              <option value="">— Choose Interest —</option>
              {interestAreas.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
            
            <div>
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={statusLocked}
                title={
                  statusDeadEnd
                    ? "This lead is Converted — status can't be changed manually anymore."
                    : campaignLocked
                    ? "This lead is part of a running campaign — status is locked until it finishes or is paused."
                    : undefined
                }
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              {statusDeadEnd ? (
                <p className="text-xs text-slate-400 mt-1">Converted — status can&apos;t be changed manually.</p>
              ) : campaignLocked && (
                <p className="text-xs text-amber-600 mt-1">Locked — this lead is part of a running campaign.</p>
              )}
            </div>
            
            <Input label="Job Title" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Job Title" />
            
            <Select label="Seniority" value={form.seniority} onChange={(e) => set("seniority", e.target.value)}>
              <option value="">— Choose Seniority —</option>
              {seniorityLevels.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            
            <Select label="Company Size" value={form.company_size} onChange={(e) => set("company_size", e.target.value)}>
              <option value="">— Choose Company Size —</option>
              {companySizeBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
            
            <div className="sm:col-span-2">
              <Input label="Twitter / X Handle" value={form.twitter_handle} onChange={(e) => set("twitter_handle", e.target.value)} placeholder="@handle" />
            </div>
            
            <div className="sm:col-span-2">
              <Input label="Street Address" value={form.street_address} onChange={(e) => set("street_address", e.target.value)} placeholder="123 Main St" />
            </div>
            
            <LocationAutocomplete
              type="city"
              value={form.city}
              onChange={(val) => set("city", val)}
              placeholder="City"
              className={fieldStyle}
              countryContext={form.country}
              stateContext={form.state}
              label="City"
            />
            
            <LocationAutocomplete
              type="state"
              value={form.state}
              onChange={(val) => set("state", val)}
              placeholder="State"
              className={fieldStyle}
              countryContext={form.country}
              label="State"
            />
            
            <LocationAutocomplete
              type="country"
              value={form.country}
              onChange={(val) => set("country", val)}
              placeholder="Country"
              className={fieldStyle}
              label="Country"
            />
            
            <Input label="Postal Code" value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="Postal Code" />
            
            <div className="sm:col-span-2">
              <Textarea
                label="About (Message / Request)"
                className="min-h-[90px] resize-y"
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                placeholder="Details or specific notes on this lead..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl px-4 py-2 font-semibold text-sm border-slate-200 dark:border-slate-850 h-10">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="rounded-xl px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold h-10 shadow-sm flex items-center gap-1.5">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
