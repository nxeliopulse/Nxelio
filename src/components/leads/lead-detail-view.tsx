"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, AtSign, Globe, Calendar, Star, Send, Building2, Target, Users, BarChart3, MoreHorizontal, MapPin, FileDown, MailOpen, Mouse, Briefcase, Pencil, Trash2 } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { ProspectScoreTab } from "@/components/leads/tabs/prospect-score";
import { CompanyIntelTab } from "@/components/leads/tabs/company-intel";
import { ContactIntelTab } from "@/components/leads/tabs/contact-intel";
import { OutreachTab } from "@/components/leads/tabs/outreach";
import { NextStepsTab } from "@/components/leads/tabs/next-steps";
import { SendEmailModal } from "@/components/leads/send-email-modal";
import { ConvertOpportunityModal } from "@/components/leads/convert-opportunity-modal";
import { EditLeadModal } from "@/components/leads/edit-lead-modal";
import { deleteLead, type LeadRow } from "@/lib/queries/leads";
import { formatDate, cn } from "@/lib/utils";

const TIMELINE_VISIBLE = 5;

interface Activity {
  id: string;
  activity_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const activityMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PAGE_VISITED: { label: "Visited a page", color: "bg-blue-500", icon: <BarChart3 className="h-3 w-3" /> },
  EMAIL_SENT: { label: "Email sent", color: "bg-blue-500", icon: <Send className="h-3 w-3" /> },
  EMAIL_OPENED: { label: "Opened email", color: "bg-emerald-500", icon: <MailOpen className="h-3 w-3" /> },
  EMAIL_CLICKED: { label: "Clicked link", color: "bg-cyan-500", icon: <Mouse className="h-3 w-3" /> },
  EMAIL_REPLIED: { label: "Replied", color: "bg-teal-500", icon: <Send className="h-3 w-3" /> },
  EMAIL_BOUNCED: { label: "Bounced", color: "bg-red-500", icon: <MailOpen className="h-3 w-3" /> },
  CONVERTED_TO_OPPORTUNITY: { label: "Converted to opportunity", color: "bg-emerald-600", icon: <Target className="h-3 w-3" /> },
  GUIDE_DOWNLOADED: { label: "Downloaded guide", color: "bg-indigo-500", icon: <FileDown className="h-3 w-3" /> },
  WEBINAR_ATTENDED: { label: "Attended webinar", color: "bg-amber-500", icon: <Calendar className="h-3 w-3" /> },
  CONSULTATION_REQUESTED: { label: "Requested consultation", color: "bg-pink-500", icon: <Calendar className="h-3 w-3" /> },
  LEAD_SCORE_UPDATED: { label: "Score updated", color: "bg-indigo-500", icon: <Target className="h-3 w-3" /> },
  LEAD_CREATED: { label: "Lead created", color: "bg-slate-400", icon: <Users className="h-3 w-3" /> },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function LeadDetailView({ lead, activities }: { lead: LeadRow; activities: Activity[] }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [, startDelete] = useTransition();
  const [tab, setTab] = useState("score");
  const [emailOpen, setEmailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [converted, setConverted] = useState(lead.status === "Converted");
  const displayName = lead.full_name || lead.company_name || "—";
  const initials = displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete lead?", message: `Delete ${displayName}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteLead(lead.id);
        toast("Lead deleted.", "success");
        router.push("/leads");
      } catch {
        toast("Couldn't delete lead. Try again.", "error");
      }
    });
  }

  // Always include "Lead created" at the bottom
  const timeline = [
    ...activities.map((a) => ({
      ...activityMeta[a.activity_type] || { label: a.activity_type, color: "bg-slate-400", icon: null },
      time: relativeTime(a.created_at),
    })),
    { label: "Lead created", color: "bg-slate-300", icon: null, time: relativeTime(lead.created_at) },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      {/* Hero card */}
      <Card className="p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xl font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>

          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
              <Badge variant={lead.status === "Hot" ? "danger" : lead.status === "Warm" ? "warning" : lead.status === "Converted" ? "success" : "blue"}>{lead.status}</Badge>
              {lead.lead_score > 0 && <Badge variant="purple">AI Scored</Badge>}
            </div>
            <p className="text-slate-500 mb-3">{lead.company_name || "—"} · {lead.industry || "—"}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4 text-slate-400" /> {lead.email || "—"}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" /> {lead.phone || "—"}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Globe className="h-4 w-4 text-slate-400" /> {lead.website_url || "—"}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <AtSign className="h-4 w-4 text-slate-400" /> {lead.linkedin ? "LinkedIn" : "—"}
              </div>
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="relative h-20 w-20">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" stroke="#f1f5f9" strokeWidth="6" fill="none" />
                  <circle cx="40" cy="40" r="32" stroke="#2563eb" strokeWidth="6" fill="none"
                    strokeDasharray={`${(lead.lead_score / 100) * 201} 201`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-2xl font-bold text-slate-900">{lead.lead_score}</span>
                  <span className="text-[10px] text-slate-500 -mt-1">SCORE</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={() => setEmailOpen(true)}><Send className="h-4 w-4" /> Send Email</Button>
              {converted ? (
                <Button variant="outline" disabled><Briefcase className="h-4 w-4" /> Converted</Button>
              ) : (
                <Button variant="outline" onClick={() => setConvertOpen(true)}><Briefcase className="h-4 w-4" /> Convert to Opportunity</Button>
              )}
              <div className="relative self-end">
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen((v) => !v)}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        onClick={() => { setMenuOpen(false); setEditOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-4 w-4 text-slate-400" /> Edit lead
                      </button>
                      <button
                        onClick={handleDelete}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" /> Delete lead
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column with tabs */}
        <div>
          <Tabs
            tabs={[
              { id: "score", label: "Prospect Score", icon: <Star className="h-4 w-4" /> },
              { id: "company", label: "Company Intel", icon: <Building2 className="h-4 w-4" /> },
              { id: "contacts", label: "Contacts", icon: <Users className="h-4 w-4" /> },
              { id: "outreach", label: "Outreach", icon: <Send className="h-4 w-4" /> },
              { id: "next", label: "Next Steps", icon: <Target className="h-4 w-4" /> },
            ]}
            active={tab}
            onChange={setTab}
            className="mb-6"
          />

          {tab === "score" && <ProspectScoreTab leadId={lead.id} initialResult={lead.ai_score} />}
          {tab === "company" && <CompanyIntelTab leadId={lead.id} />}
          {tab === "contacts" && <ContactIntelTab leadId={lead.id} />}
          {tab === "outreach" && <OutreachTab leadId={lead.id} />}
          {tab === "next" && <NextStepsTab leadId={lead.id} />}
        </div>

        {/* Activity timeline */}
        <div>
          <Card>
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" /> Activity Timeline
              </h3>
            </div>
            <div className={cn("p-5", timeline.length > TIMELINE_VISIBLE && "max-h-80 overflow-y-auto")}>
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet</p>
              ) : (
                <ol className="relative border-l border-slate-200 ml-3 space-y-5">
                  {timeline.map((e, i) => (
                    <li key={i} className="ml-4">
                      <span className={`absolute -left-1.5 h-3 w-3 rounded-full ${e.color} ring-4 ring-white`} />
                      <p className="text-sm font-medium text-slate-900">{e.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{e.time}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-600" /> Lead Source
              </h3>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source</span>
                <span className="font-medium text-slate-900">{lead.source || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Created</span>
                <span className="font-medium text-slate-900">{formatDate(lead.created_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Interest area</span>
                <span className="font-medium text-slate-900">{lead.interest_area || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant={lead.status === "Hot" ? "danger" : "blue"}>{lead.status}</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <SendEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        leadId={lead.id}
        leadEmail={lead.email}
        leadName={displayName}
      />

      <ConvertOpportunityModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
        onConverted={() => { setConverted(true); setConvertOpen(false); }}
      />

      <EditLeadModal open={editOpen} onClose={() => setEditOpen(false)} lead={lead} />
    </div>
  );
}
