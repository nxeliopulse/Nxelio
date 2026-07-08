"use client";
import { useState, useTransition } from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { industries, interestAreas } from "@/lib/mock-data";
import { User, Building2, AlertCircle } from "lucide-react";
import { createLead } from "@/lib/queries/leads";

export function LeadForm({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("details");
  const [mode, setMode] = useState<"person" | "company">("person");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    email: "",
    website_url: "",
    phone: "",
    linkedin: "",
    message: "",
    industry: "",
    interest_area: "",
    source: "Website Form",
    status: "New",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validate either name or company is provided
    if (mode === "person" && !form.full_name) {
      setError("Full name is required");
      return;
    }
    if (mode === "company" && !form.company_name) {
      setError("Company name is required");
      return;
    }
    if (!form.email && !form.website_url) {
      setError("Email or website URL is required");
      return;
    }

    start(async () => {
      try {
        await createLead({
          full_name: mode === "person" ? form.full_name : null,
          company_name: form.company_name || null,
          email: form.email || null,
          website_url: form.website_url || null,
          phone: form.phone || null,
          linkedin: form.linkedin || null,
          message: form.message || null,
          industry: form.industry || null,
          interest_area: form.interest_area || null,
          source: form.source,
          status: form.status,
          lead_score: 0,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create lead");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-5 pt-4">
        <Tabs
          tabs={[
            { id: "details", label: "Lead Details" },
            { id: "additional", label: "Additional Info" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tab === "details" && (
          <>
            {/* Mode toggle */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setMode("person")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${mode === "person" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
              >
                <User className="h-3.5 w-3.5" /> Person
              </button>
              <button
                type="button"
                onClick={() => setMode("company")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${mode === "company" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
              >
                <Building2 className="h-3.5 w-3.5" /> Company
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {mode === "person" ? "Full Name *" : "Company Name *"}
                </label>
                <Input
                  placeholder={mode === "person" ? "John Smith" : "ABC Corporation"}
                  value={mode === "person" ? form.full_name : form.company_name}
                  onChange={(e) =>
                    setForm({ ...form, [mode === "person" ? "full_name" : "company_name"]: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <Input type="email" placeholder="john@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Website URL</label>
                <Input placeholder="company.com" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                <Input placeholder="+1 415 555 0142" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">LinkedIn Profile URL</label>
                <Input placeholder="linkedin.com/in/..." value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message / Request</label>
                <Textarea placeholder="What is the lead interested in?" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {tab === "additional" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
              <Select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
                <option value="">Select industry</option>
                {industries.map((i) => <option key={i}>{i}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Interest Area</label>
              <Select value={form.interest_area} onChange={(e) => setForm({ ...form, interest_area: e.target.value })}>
                <option value="">Select interest</option>
                {interestAreas.map((a) => <option key={a}>{a}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Source</label>
              <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option>Website Form</option>
                <option>Ebook Download</option>
                <option>Webinar</option>
                <option>Cold Email</option>
                <option>Referral</option>
                <option>LinkedIn</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>New</option>
                <option>Warm</option>
                <option>Hot</option>
                <option>Scored</option>
                <option>Converted</option>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save lead"}</Button>
      </div>
    </form>
  );
}
