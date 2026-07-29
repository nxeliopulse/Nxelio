"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { updateLead, type LeadRow } from "@/lib/queries/leads";
import { industries, interestAreas } from "@/lib/mock-data";

const STATUSES = ["New", "Contacted", "Qualified", "Nurturing"];

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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <div className="col-span-2">
              <label className={label}>Status</label>
              <Select className={field} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {/* Include the lead's current status even if it's a legacy value (e.g. "Converted")
                    no longer offered for new selections — otherwise the dropdown would silently
                    show a different value than what's actually saved. */}
                {(STATUSES.includes(form.status) ? STATUSES : [...STATUSES, form.status]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
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
