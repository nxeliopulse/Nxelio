"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { updateLead, type LeadRow } from "@/lib/queries/leads";
import { industries as FALLBACK_INDUSTRIES, interestAreas as FALLBACK_INTEREST_AREAS } from "@/lib/mock-data";
import { getPicklistValues } from "@/lib/queries/picklists";

// Fallback values render immediately while the workspace's actual (admin-editable,
// Settings > Picklists) values load in — avoids the dropdown flashing empty.
const FALLBACK_STATUSES = ["New", "Contacted", "Qualified", "Nurturing"];
const FALLBACK_COMPANY_SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const FALLBACK_SENIORITY_LEVELS = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"];

export function EditLeadModal({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: LeadRow }) {
  const router = useRouter();
  const { toast } = useFeedback();
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
    // Mirrors the DB's lead_contact_check constraint — a lead must keep at
    // least one contact method, or the update is rejected at the DB level.
    if (!form.email.trim() && !form.website_url.trim() && !form.linkedin.trim()) {
      setError("At least one of Email, Website, or LinkedIn is required.");
      return;
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
        status: form.status,
        job_title: form.job_title.trim() || null,
        seniority: form.seniority || null,
        company_size: form.company_size || null,
        twitter_handle: form.twitter_handle.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        postal_code: form.postal_code.trim() || null,
      });
      toast("Lead updated.", "success");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const label = "block text-xs font-medium text-slate-600 mb-1";
  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="px-6 sm:px-10 py-5 border-b border-slate-100 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-xl text-slate-900">Edit lead</h2>
            <p className="text-sm text-slate-500 mt-0.5">Update this lead&apos;s details</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 rounded-md p-1">
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 px-6 sm:px-10 py-8">
        <div className="max-w-3xl mx-auto">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Name</label>
              <input className={field} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </div>
            <div>
              <label className={label}>Company</label>
              <input className={field} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input type="email" className={field} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className={label}>Website</label>
              <input className={field} value={form.website_url} onChange={(e) => set("website_url", e.target.value)} />
            </div>
            <div>
              <label className={label}>LinkedIn</label>
              <input className={field} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} />
            </div>
            <div>
              <label className={label}>Industry</label>
              <Select className={field} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                <option value="">—</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </div>
            <div>
              <label className={label}>Interest area</label>
              <Select className={field} value={form.interest_area} onChange={(e) => set("interest_area", e.target.value)}>
                <option value="">—</option>
                {interestAreas.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </div>
            <div>
              <label className={label}>Status</label>
              <Select className={field} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {/* Include the lead's current status even if it's a legacy value (e.g. "Converted")
                    no longer offered for new selections — otherwise the dropdown would silently
                    show a different value than what's actually saved. */}
                {(statuses.includes(form.status) ? statuses : [...statuses, form.status]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={label}>Job title</label>
              <input className={field} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
            </div>
            <div>
              <label className={label}>Seniority</label>
              <Select className={field} value={form.seniority} onChange={(e) => set("seniority", e.target.value)}>
                <option value="">—</option>
                {seniorityLevels.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className={label}>Company size</label>
              <Select className={field} value={form.company_size} onChange={(e) => set("company_size", e.target.value)}>
                <option value="">—</option>
                {companySizeBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </div>
            <div>
              <label className={label}>Twitter / X handle</label>
              <input className={field} value={form.twitter_handle} onChange={(e) => set("twitter_handle", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={label}>Street address</label>
              <input className={field} value={form.street_address} onChange={(e) => set("street_address", e.target.value)} />
            </div>
            <div>
              <label className={label}>City</label>
              <input className={field} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className={label}>State</label>
              <input className={field} value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div>
              <label className={label}>Country</label>
              <input className={field} value={form.country} onChange={(e) => set("country", e.target.value)} />
            </div>
            <div>
              <label className={label}>Postal code</label>
              <input className={field} value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 sm:px-10 py-4 border-t border-slate-100 flex-shrink-0 flex items-center justify-end gap-2 max-w-3xl mx-auto w-full">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
