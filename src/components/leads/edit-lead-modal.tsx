"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Lock, X, User, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { updateLead, updateLeadStatus, type LeadRow } from "@/lib/queries/leads";
import { industries as FALLBACK_INDUSTRIES, interestAreas as FALLBACK_INTEREST_AREAS } from "@/lib/mock-data";
import { getPicklistValues } from "@/lib/queries/picklists";
import { useLeadInActiveCampaign } from "@/lib/leads/use-lead-in-active-campaign";
import { isSuperAdmin } from "@/lib/queries/auth-guards";

const FALLBACK_STATUSES = ["New", "Contacted", "Qualified", "Nurturing"];
const FALLBACK_COMPANY_SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const FALLBACK_SENIORITY_LEVELS = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"];

export function EditLeadModal({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: LeadRow }) {
  const router = useRouter();
  const { toast, prompt } = useFeedback();
  const statusLocked = useLeadInActiveCampaign(lead.id);
  const [amSuperAdmin, setAmSuperAdmin] = useState(false);
  useEffect(() => { isSuperAdmin().then(setAmSuperAdmin).catch(() => {}); }, []);
  const lockedFields = lead.locked_fields ?? {};
  const fieldLocked = (field: string) => Boolean(lockedFields[field]) && !amSuperAdmin;
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
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES);
  const [companySizeBuckets, setCompanySizeBuckets] = useState(FALLBACK_COMPANY_SIZE_BUCKETS);
  const [seniorityLevels, setSeniorityLevels] = useState(FALLBACK_SENIORITY_LEVELS);

  useEffect(() => {
    getPicklistValues("lead_industry").then(setIndustries).catch(() => {});
    getPicklistValues("lead_interest_area").then(setInterestAreas).catch(() => {});
    getPicklistValues("lead_status").then(setStatuses).catch(() => {});
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
        phone: form.phone.trim() || null,
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

  const labelStyle = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5";
  const fieldStyle = "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] transition";

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50 transition-opacity" onClick={onClose} />

      {/* Right side drawer */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[580px] bg-white dark:bg-slate-950 shadow-2xl border-l border-slate-200 dark:border-slate-850 flex flex-col h-screen animate-in slide-in-from-right duration-250">
        
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className={labelStyle}>Name <span className="text-red-500">*</span></label>
              <input className={fieldStyle} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Full Name" />
            </div>
            <div>
              <label className={labelStyle}>Company <span className="text-red-500">*</span></label>
              <input className={fieldStyle} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Company Name" />
            </div>
            <div>
              <label className={labelStyle}>
                Email {fieldLocked("email") && <Lock className="inline h-3 w-3 text-slate-400 ml-1" />}
              </label>
              <input
                type="email" className={fieldStyle} value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="email@example.com" disabled={fieldLocked("email")}
                title={fieldLocked("email") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              />
              {fieldLocked("email") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            <div>
              <label className={labelStyle}>
                Phone {fieldLocked("phone") && <Lock className="inline h-3 w-3 text-slate-400 ml-1" />}
              </label>
              <input
                className={fieldStyle} value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="Phone number" disabled={fieldLocked("phone")}
                title={fieldLocked("phone") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              />
              {fieldLocked("phone") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            <div>
              <label className={labelStyle}>Website</label>
              <input className={fieldStyle} value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://example.com" />
            </div>
            <div>
              <label className={labelStyle}>
                LinkedIn {fieldLocked("linkedin") && <Lock className="inline h-3 w-3 text-slate-400 ml-1" />}
              </label>
              <input
                className={fieldStyle} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)}
                placeholder="LinkedIn Profile URL" disabled={fieldLocked("linkedin")}
                title={fieldLocked("linkedin") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              />
              {fieldLocked("linkedin") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            <div>
              <label className={labelStyle}>
                Industry {fieldLocked("industry") && <Lock className="inline h-3 w-3 text-slate-400 ml-1" />}
              </label>
              <Select
                className={fieldStyle} value={form.industry} onChange={(e) => set("industry", e.target.value)}
                disabled={fieldLocked("industry")}
                title={fieldLocked("industry") ? "Locked after its first edit — only a Super Admin can change it now." : undefined}
              >
                <option value="">— Choose Industry —</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
              {fieldLocked("industry") && <p className="text-[11px] text-slate-400 mt-1">Locked — only a Super Admin can edit this.</p>}
            </div>
            <div>
              <label className={labelStyle}>Interest Area</label>
              <Select className={fieldStyle} value={form.interest_area} onChange={(e) => set("interest_area", e.target.value)}>
                <option value="">— Choose Interest —</option>
                {interestAreas.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </div>
            <div>
              <label className={labelStyle}>Status</label>
              <Select
                className={fieldStyle}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={statusLocked}
                title={statusLocked ? "This lead is part of a running campaign — status is locked until it finishes or is paused." : undefined}
              >
                {(statuses.includes(form.status) ? statuses : [...statuses, form.status]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              {statusLocked && (
                <p className="text-xs text-amber-600 mt-1">Locked — this lead is part of a running campaign.</p>
              )}
            </div>
            <div>
              <label className={labelStyle}>Job Title</label>
              <input className={fieldStyle} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Job Title" />
            </div>
            <div>
              <label className={labelStyle}>Seniority</label>
              <Select className={fieldStyle} value={form.seniority} onChange={(e) => set("seniority", e.target.value)}>
                <option value="">— Choose Seniority —</option>
                {seniorityLevels.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className={labelStyle}>Company Size</label>
              <Select className={fieldStyle} value={form.company_size} onChange={(e) => set("company_size", e.target.value)}>
                <option value="">— Choose Company Size —</option>
                {companySizeBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelStyle}>Twitter / X Handle</label>
              <input className={fieldStyle} value={form.twitter_handle} onChange={(e) => set("twitter_handle", e.target.value)} placeholder="@handle" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelStyle}>Street Address</label>
              <input className={fieldStyle} value={form.street_address} onChange={(e) => set("street_address", e.target.value)} placeholder="123 Main St" />
            </div>
            <div>
              <label className={labelStyle}>City</label>
              <input className={fieldStyle} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
            </div>
            <div>
              <label className={labelStyle}>State</label>
              <input className={fieldStyle} value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State" />
            </div>
            <div>
              <label className={labelStyle}>Country</label>
              <input className={fieldStyle} value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" />
            </div>
            <div>
              <label className={labelStyle}>Postal Code</label>
              <input className={fieldStyle} value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="Postal Code" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelStyle}>About (Message / Request)</label>
              <textarea
                className={`${fieldStyle} min-h-[90px] resize-y`}
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
    </>
  );
}
