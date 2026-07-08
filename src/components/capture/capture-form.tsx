"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Globe, Phone, User, Building2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { capturePublicLead } from "@/lib/queries/capture";

const industries = ["Technology", "Consulting", "Enterprise Software", "Analytics", "Retail", "Cloud Services", "Manufacturing", "Training", "Healthcare", "Finance"];
const interests = ["CRM Automation", "SAP AI", "Digital Transformation", "AI Platforms", "Customer Engagement", "Workflow Automation", "AI Personalization", "Lead Nurturing", "Lead Scoring"];

interface Props {
  workspaceSlug?: string;
  workspaceName?: string;
}

export function CaptureForm({ workspaceSlug, workspaceName }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const initial = {
    fullName: "", companyName: "", email: "", phone: "", websiteUrl: "",
    industry: "", interestArea: "", message: "", linkedin: "",
  };
  const [form, setForm] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await capturePublicLead({ ...form, workspaceSlug });
      if (!res.ok) setError(res.error || "Submission failed");
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Thanks — we&apos;ve got it!</h1>
          <p className="text-slate-500 mb-6">Our team will be in touch within 1 business day. Keep an eye on your inbox.</p>
          <Button onClick={() => { setDone(false); setForm(initial); }}>Submit another lead</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold mb-4">
            <Sparkles className="h-3 w-3" /> AI-Powered Lead Nurturing
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Tell us about your business</h1>
          <p className="text-slate-600 max-w-md mx-auto">
            {workspaceName
              ? `We'll share your details with the ${workspaceName} team.`
              : "We'll send a personalized engagement plan within 24 hours."}
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8 space-y-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <Input leftIcon={<User className="h-4 w-4" />} placeholder="Jane Doe" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company name</label>
              <Input leftIcon={<Building2 className="h-4 w-4" />} placeholder="Acme Inc" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Work email *</label>
              <Input type="email" leftIcon={<Mail className="h-4 w-4" />} placeholder="jane@acme.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
              <Input leftIcon={<Phone className="h-4 w-4" />} placeholder="+1 415 555 0142" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
            <Input leftIcon={<Globe className="h-4 w-4" />} placeholder="acme.com" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
              <Select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
                <option value="">Select industry</option>
                {industries.map((i) => <option key={i}>{i}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Interest</label>
              <Select value={form.interestArea} onChange={(e) => setForm({ ...form, interestArea: e.target.value })}>
                <option value="">Select interest</option>
                {interests.map((a) => <option key={a}>{a}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">What are you looking for?</label>
            <Textarea placeholder="Tell us a bit about your needs..." rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Submitting..." : "Get my personalized plan"}
          </Button>

          <p className="text-xs text-slate-400 text-center">
            By submitting you agree to receive personalized outreach. <Link href="#" className="underline">Privacy</Link>
          </p>
        </form>

        <p className="text-center text-xs text-slate-400 mt-8">
          Powered by <Link href="/login" className="font-semibold text-slate-600 hover:text-slate-900">LeadPro</Link>
        </p>
      </div>
    </div>
  );
}
