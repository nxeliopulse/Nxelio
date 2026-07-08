"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { updateLead, type LeadRow } from "@/lib/queries/leads";
import { industries, interestAreas } from "@/lib/mock-data";

const STATUSES = ["New", "Warm", "Hot", "Converted", "Scored"];

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
    } catch {
      toast("Couldn't save changes. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Modal open={open} onClose={onClose} title="Edit lead" description="Update this lead's details" size="md">
      <div className="p-5 space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Full name</label>
            <input className={field} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Company</label>
            <input className={field} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input type="email" className={field} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Phone</label>
            <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Website</label>
            <input className={field} value={form.website_url} onChange={(e) => set("website_url", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">LinkedIn</label>
            <input className={field} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Industry</label>
            <Select className={field} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
              <option value="">—</option>
              {industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Interest area</label>
            <Select className={field} value={form.interest_area} onChange={(e) => set("interest_area", e.target.value)}>
              <option value="">—</option>
              {interestAreas.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <Select className={field} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </Modal>
  );
}
