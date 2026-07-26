"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, X, Mail, Phone, Globe, Calendar, Star, Send, Building2,
  Target, Users, BarChart3, MoreHorizontal, FileDown, MailOpen,
  Mouse, Briefcase, Pencil, Trash2, CalendarDays, ChevronDown, ChevronUp,
  RefreshCw, Sparkles, Filter, CheckCircle2, UserCheck, Plus, ExternalLink, History as HistoryIcon, Megaphone
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { ProspectScoreTab } from "@/components/leads/tabs/prospect-score";
import { SendEmailModal } from "@/components/leads/send-email-modal";
import { ConvertOpportunityModal } from "@/components/leads/convert-opportunity-modal";
import { EditLeadModal } from "@/components/leads/edit-lead-modal";
import { FindEmailPicker } from "@/components/leads/find-email-picker";
import { LeadNotesCard } from "@/components/leads/lead-notes-card";
import { deleteLead, type LeadRow } from "@/lib/queries/leads";
import { STAGE_LABELS, type OpportunityRow } from "@/lib/opportunities";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { LeadHistory } from "@/lib/queries/lead-detail";
import type { LeadCampaignSummary } from "@/lib/queries/campaigns";
import type { LeadNoteRow } from "@/lib/queries/lead-notes";
import { formatDate, formatDateTime, cn } from "@/lib/utils";

function money(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export interface Activity {
  id: string;
  activity_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const activityMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PAGE_VISITED: { label: "Visited a page", color: "bg-blue-500", icon: <BarChart3 className="h-3.5 w-3.5 text-white" /> },
  EMAIL_SENT: { label: "Sent email", color: "bg-blue-600", icon: <Send className="h-3.5 w-3.5 text-white" /> },
  EMAIL_OPENED: { label: "Opened email", color: "bg-emerald-500", icon: <MailOpen className="h-3.5 w-3.5 text-white" /> },
  EMAIL_CLICKED: { label: "Clicked link in email", color: "bg-cyan-500", icon: <Mouse className="h-3.5 w-3.5 text-white" /> },
  EMAIL_REPLIED: { label: "Replied to outreach", color: "bg-teal-500", icon: <Send className="h-3.5 w-3.5 text-white" /> },
  EMAIL_BOUNCED: { label: "Email bounced", color: "bg-rose-500", icon: <MailOpen className="h-3.5 w-3.5 text-white" /> },
  CONVERTED_TO_OPPORTUNITY: { label: "Converted to opportunity", color: "bg-emerald-600", icon: <Target className="h-3.5 w-3.5 text-white" /> },
  GUIDE_DOWNLOADED: { label: "Downloaded resource guide", color: "bg-indigo-500", icon: <FileDown className="h-3.5 w-3.5 text-white" /> },
  WEBINAR_ATTENDED: { label: "Attended live webinar", color: "bg-amber-500", icon: <Calendar className="h-3.5 w-3.5 text-white" /> },
  CONSULTATION_REQUESTED: { label: "Requested consultation", color: "bg-pink-500", icon: <Calendar className="h-3.5 w-3.5 text-white" /> },
  LEAD_SCORE_UPDATED: { label: "AI Score updated", color: "bg-indigo-500", icon: <Target className="h-3.5 w-3.5 text-white" /> },
  LEAD_CREATED: { label: "Contact record created", color: "bg-slate-400", icon: <Users className="h-3.5 w-3.5 text-white" /> },
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

export function LeadDetailView({
  lead,
  activities,
  opportunities = [],
  meetings = [],
  history = null,
  notes = [],
  campaigns = [],
  onClose,
  embedded,
}: {
  lead: LeadRow;
  activities: Activity[];
  opportunities?: OpportunityRow[];
  meetings?: MeetingRow[];
  history?: LeadHistory | null;
  notes?: LeadNoteRow[];
  campaigns?: LeadCampaignSummary[];
  onClose?: () => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [, startDelete] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [converted, setConverted] = useState(lead.status === "Converted");
  const [email, setEmail] = useState(lead.email);
  const [findEmailOpen, setFindEmailOpen] = useState(false);

  // Accordion Section States (Salesforce Lightning Collapsible Sections)
  const [aboutOpen, setAboutOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(true);
  const [oppsOpen, setOppsOpen] = useState(true);
  const [meetingsOpen, setMeetingsOpen] = useState(true);
  const [campaignsOpen, setCampaignsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [onlyInsights, setOnlyInsights] = useState(false);
  const [showAiScoreDrawer, setShowAiScoreDrawer] = useState(false);

  const displayName = lead.full_name || lead.company_name || "—";
  const splitNames = displayName.split(" ");
  const firstName = splitNames[0] || "";
  const lastName = splitNames.slice(1).join(" ") || "";

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete contact?", message: `Delete ${displayName}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteLead(lead.id);
        toast("Contact deleted.", "success");
        if (onClose) onClose();
        else router.push("/leads");
      } catch {
        toast("Couldn't delete contact.", "error");
      }
    });
  }

  const timeline = [
    ...activities.map((a) => ({
      ...activityMeta[a.activity_type] || { label: a.activity_type, color: "bg-slate-400", icon: null },
      time: relativeTime(a.created_at),
      iso: a.created_at,
    })),
    { label: "Contact created in LeadPro workspace", color: "bg-slate-300", icon: null, time: relativeTime(lead.created_at), iso: lead.created_at },
  ];

  return (
    <div className="max-w-[1650px] mx-auto pb-10 text-slate-800 dark:text-slate-200">
      {/* Navigation Top Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {onClose ? (
            <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
              <X className="h-4 w-4" /> Close Record
            </button>
          ) : (
            <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Contacts / Leads
            </Link>
          )}
        </div>
      </div>

      {/* ── Salesforce Header Banner ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 mb-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Salesforce-style Purple Avatar Badge */}
            <div className="h-11 w-11 rounded-lg bg-[#6b21a8] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <UserCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contact</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
                {displayName}
              </h1>
            </div>
          </div>

          {/* Top-Right Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {converted ? (
              <Button variant="outline" size="sm" disabled className="rounded-lg text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Converted
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConvertOpen(true)} className="rounded-lg text-xs font-semibold">
                <Briefcase className="h-3.5 w-3.5 text-slate-500" /> New Opportunity
              </Button>
            )}

            <Button size="sm" onClick={() => setEmailOpen(true)} className="rounded-lg text-xs font-bold bg-[#18A7B8] hover:bg-[#14929f] text-white">
              <Mail className="h-3.5 w-3.5" /> Send Email
            </Button>

            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="rounded-lg text-xs font-semibold">
              <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit
            </Button>

            <div className="relative">
              <Button variant="outline" size="icon" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 shadow-lg text-xs">
                    <button onClick={() => { setMenuOpen(false); setEditOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit Record
                    </button>
                    <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                      <Trash2 className="h-3.5 w-3.5" /> Delete Record
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Salesforce 3-Column Lightning Layout ── */}
      <div className={cn("grid gap-5", embedded ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12")}>

        {/* ── LEFT COLUMN (Record Details: About + Get in Touch with Map) ── */}
        <div className={cn("space-y-4", embedded ? "w-full" : "lg:col-span-4 xl:col-span-3")}>
          {/* Card 1: About */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => setAboutOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {aboutOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                About
              </span>
              <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditOpen(true); }} />
            </button>

            {aboutOpen && (
              <div className="p-4 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">First Name</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{firstName || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Last Name</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{lastName || "—"}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Email</span>
                  {email ? (
                    <a href={`mailto:${email}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all">{email}</a>
                  ) : (
                    <button type="button" onClick={() => setFindEmailOpen((v) => !v)} className="text-blue-600 hover:underline font-semibold">
                      + Find email address
                    </button>
                  )}
                  {!email && findEmailOpen && (
                    <div className="mt-2">
                      <FindEmailPicker leadId={lead.id} linkedinUrl={lead.linkedin} onFound={(found) => { setEmail(found); setFindEmailOpen(false); }} />
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Phone</span>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">{lead.phone}</a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">LinkedIn Profile</span>
                  {lead.linkedin ? (
                    <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all inline-flex items-center gap-1">
                      View profile <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Website</span>
                  {lead.website_url ? (
                    <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all">{lead.website_url}</a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>

                {lead.company_name && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Account Name</span>
                    <div className="flex items-center justify-between group">
                      <span className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{lead.company_name}</span>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer" onClick={() => setEditOpen(true)} />
                    </div>
                  </div>
                )}

                {lead.industry && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Industry</span>
                    <div className="flex items-center justify-between group">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{lead.industry}</span>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer" onClick={() => setEditOpen(true)} />
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">AI Lead Score</span>
                  <div className="flex items-center justify-between">
                    <Badge variant={lead.lead_score >= 70 ? "danger" : lead.lead_score >= 40 ? "warning" : "blue"} className="font-bold">
                      {lead.lead_score} / 100
                    </Badge>
                    <button onClick={() => setShowAiScoreDrawer(true)} className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> View Score Breakdown
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Contact Owner</span>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <div className="h-4 w-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span>{displayName}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {historyOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                History
              </span>
            </button>

            {historyOpen && (
              <div className="p-4 space-y-3.5 text-xs">
                {history?.source && (
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 font-medium mb-0.5">Source</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{history.source}</span>
                  </div>
                )}
                <div className={cn(history?.source && "border-t border-slate-100 dark:border-slate-800/80 pt-3")}>
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Created By</span>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <HistoryIcon className="h-3.5 w-3.5 text-slate-400" />
                    <span>{history?.createdByName || "—"}</span>
                  </div>
                  <span className="block text-slate-400 mt-0.5">{formatDateTime(history?.createdAt || lead.created_at)}</span>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Last Modified By</span>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <HistoryIcon className="h-3.5 w-3.5 text-slate-400" />
                    <span>{history?.lastModifiedByName || "—"}</span>
                  </div>
                  <span className="block text-slate-400 mt-0.5">{formatDateTime(history?.lastModifiedAt || lead.updated_at)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER COLUMN (Quick Actions + Activity Timeline) ── */}
        <div className={cn("space-y-4", embedded ? "w-full" : "lg:col-span-5 xl:col-span-6")}>
          {/* Quick Action Pill Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)} className="rounded-full text-xs font-semibold gap-1.5 bg-slate-50 dark:bg-slate-800">
                <Mail className="h-3.5 w-3.5 text-blue-600" /> Email <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/meetings")} className="rounded-full text-xs font-semibold gap-1.5 bg-slate-50 dark:bg-slate-800">
                <Calendar className="h-3.5 w-3.5 text-purple-600" /> Event <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)} className="rounded-full text-xs font-semibold gap-1.5 bg-slate-50 dark:bg-slate-800">
                <Phone className="h-3.5 w-3.5 text-emerald-600" /> Log Call <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/workflows")} className="rounded-full text-xs font-semibold gap-1.5 bg-slate-50 dark:bg-slate-800">
                <Target className="h-3.5 w-3.5 text-amber-600" /> New Task <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
            </div>

            {/* Insights Filter Toggle Bar */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyInsights}
                  onChange={(e) => setOnlyInsights(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Only show activities with insights
              </label>

              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                <span>Filters: All time · All activities · All types</span>
                <button onClick={() => toast("Activities refreshed", "info")} className="hover:text-blue-600 inline-flex items-center gap-1 font-semibold">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Activity Accordions: Upcoming & Overdue + Past Activity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            {/* Accordion 1: Upcoming & Overdue */}
            <button
              onClick={() => setUpcomingOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {upcomingOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Upcoming & Overdue
              </span>
            </button>

            {upcomingOpen && (
              <div className="p-4 text-center py-6 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                {meetings.length > 0 ? (
                  <div className="space-y-2 text-left">
                    {meetings.map((m) => (
                      <div key={m.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{m.title}</p>
                          <p className="text-[11px] text-slate-500">{formatDateTime(m.start_at)}</p>
                        </div>
                        <Badge variant="blue">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No activities to show.</p>
                    <p className="text-slate-400">Get started by sending an email, scheduling a task, and more.</p>
                  </>
                )}
              </div>
            )}

            {/* Accordion 2: Past Activity */}
            <button
              onClick={() => setPastOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {pastOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Past Activity ({timeline.length})
              </span>
            </button>

            {pastOpen && (
              <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
                <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-3 space-y-4">
                  {timeline.map((e, i) => (
                    <li key={i} className="ml-4 text-xs">
                      <span className={`absolute -left-1.5 h-3 w-3 rounded-full ${e.color} ring-4 ring-white dark:ring-slate-900`} />
                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-slate-900 dark:text-white text-xs">{e.label}</p>
                          <span className="text-[10px] text-slate-400">{e.time}</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px]">Logged in LeadPro workspace pipeline for {firstName}.</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (AI Einstein Summary + Related Opportunities & Meetings) ── */}
        <div className={cn("space-y-4", embedded ? "w-full" : "lg:col-span-3 xl:col-span-3")}>
          {/* Card 1: Salesforce Einstein AI Summary — compact, no decorative graphic */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-blue-600" /> AI Summary
              </h3>
              <Button size="sm" onClick={() => setShowAiScoreDrawer(true)} className="rounded-full text-xs font-bold gap-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 flex-shrink-0">
                Summarize <Sparkles className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Card 2: Opportunities List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => setOppsOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {oppsOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Opportunities ({opportunities.length})
              </span>
              <Plus
                className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setConvertOpen(true); }}
              />
            </button>

            {oppsOpen && (
              <div className="p-4 space-y-3 text-xs">
                {opportunities.length === 0 ? (
                  <p className="text-slate-400 italic">No opportunities associated with this contact yet.</p>
                ) : (
                  opportunities.map((o) => (
                    <div key={o.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{o.name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge variant={o.stage === "won" ? "success" : o.stage === "lost" ? "danger" : "blue"}>{STAGE_LABELS[o.stage]}</Badge>
                        <span className="font-bold text-emerald-600">{money(Number(o.deal_value || 0))}</span>
                      </div>
                    </div>
                  ))
                )}
                <Link href="/opportunities" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1">
                  View All Opportunities →
                </Link>
              </div>
            )}
          </div>

          {/* Card 3: Meetings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => setMeetingsOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {meetingsOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Meetings ({meetings.length})
              </span>
              <Plus
                className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); router.push(`/meetings?leads=${lead.id}`); }}
              />
            </button>

            {meetingsOpen && (
              <div className="p-4 space-y-3 text-xs">
                {meetings.length === 0 ? (
                  <p className="text-slate-400 italic">No meetings scheduled for this contact.</p>
                ) : (
                  meetings.map((m) => (
                    <div key={m.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{m.title}</p>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                        <span>{formatDateTime(m.start_at)}</span>
                        <Badge variant="blue">{m.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
                <Link href="/meetings" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1">
                  View All Meetings →
                </Link>
              </div>
            )}
          </div>

          {/* Card 4: Campaigns */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => setCampaignsOpen((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="inline-flex items-center gap-2">
                {campaignsOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Campaigns ({campaigns.length})
              </span>
              <Plus
                className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); router.push("/campaigns/builder"); }}
              />
            </button>

            {campaignsOpen && (
              <div className="p-4 space-y-3 text-xs">
                {campaigns.length === 0 ? (
                  <p className="text-slate-400 italic">This contact hasn&apos;t been part of any campaign yet.</p>
                ) : (
                  campaigns.map((c) => (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <Megaphone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {c.campaign_name}
                        </p>
                        <ExternalLink className="h-3 w-3 text-slate-300 flex-shrink-0" />
                      </div>
                      <div className="mt-1.5">
                        <Badge variant={c.status === "Active" ? "success" : "blue"}>{c.status}</Badge>
                      </div>
                    </Link>
                  ))
                )}
                <Link href="/campaigns" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1">
                  View All Campaigns →
                </Link>
              </div>
            )}
          </div>

          {/* Card 5: Notes */}
          <LeadNotesCard leadId={lead.id} notes={notes} />
        </div>
      </div>

      {/* AI Score Breakdown Modal Drawer */}
      {showAiScoreDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">AI Prospect Score Breakdown</h3>
              </div>
              <button onClick={() => setShowAiScoreDrawer(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ProspectScoreTab leadId={lead.id} initialResult={lead.ai_score} />
          </div>
        </div>
      )}

      {/* Modals */}
      <SendEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        leadId={lead.id}
        leadEmail={email}
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
