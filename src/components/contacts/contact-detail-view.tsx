"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, MoreHorizontal, Mail, Phone, Building2, ExternalLink,
  Download, RefreshCw, ChevronDown, Star, Send, Share2, Heart, Plus, Paperclip,
  Calendar, Globe, MessageCircle, Link2, AtSign, ArrowLeft, Video, Pin,
  Clock, FileText, PhoneCall, File as FileIcon, UserPlus, Users, CalendarPlus, ListTodo, ArrowUpDown,
  Briefcase, Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { ContactNotesCard } from "@/components/contacts/contact-notes-card";
import { AddDealModal } from "@/components/contacts/add-deal-modal";
import { ScheduleMeetingModal } from "@/components/contacts/schedule-meeting-modal";
import { AddTaskModal } from "@/components/contacts/add-task-modal";
import { ContactTasksCard } from "@/components/contacts/contact-tasks-card";
import { LogCallModal } from "@/components/contacts/log-call-modal";
import { ContactCallsCard } from "@/components/contacts/contact-calls-card";
import { AddDocumentModal } from "@/components/contacts/add-document-modal";
import { ContactDocumentsCard } from "@/components/contacts/contact-documents-card";
import { ContactEmailCard } from "@/components/contacts/contact-email-card";
import { ComposeEmailModal } from "@/components/contacts/compose-email-modal";
import type { OwnerOption } from "@/components/contacts/contacts-table";
import { type ContactNoteRow } from "@/lib/queries/contact-notes";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { ContactTaskRow } from "@/lib/queries/contact-tasks";
import type { ContactCallRow } from "@/lib/queries/contact-calls";
import type { ContactDocumentRow } from "@/lib/queries/contact-documents";
import type { ContactEmailRow } from "@/lib/queries/contact-emails";
import type { OpportunityRow } from "@/lib/opportunities";
import { deleteContact, type ContactWithAccount } from "@/lib/queries/contacts";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const STARRED_KEY = "lp_starred_contacts";

type TabId = "activities" | "notes" | "calls" | "files" | "email";
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "activities", label: "Activities", icon: Clock },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "calls", label: "Calls", icon: PhoneCall },
  { id: "files", label: "Files", icon: FileIcon },
  { id: "email", label: "Email", icon: Mail },
];

export function ContactDetailView({
  contact, owners = [], notes = [], meetings = [], tasks = [], calls = [], documents = [], emails = [], mailboxConnected = false, deals = [], totalCount = 0,
}: {
  contact: ContactWithAccount;
  owners?: OwnerOption[];
  notes?: ContactNoteRow[];
  meetings?: MeetingRow[];
  tasks?: ContactTaskRow[];
  calls?: ContactCallRow[];
  documents?: ContactDocumentRow[];
  emails?: ContactEmailRow[];
  mailboxConnected?: boolean;
  deals?: OpportunityRow[];
  totalCount?: number;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [, startDelete] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("activities");
  const [activitySort, setActivitySort] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STARRED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount
      setIsStarred(list.includes(contact.id));
    } catch { /* ignore */ }
  }, [contact.id]);

  function toggleStar() {
    try {
      const raw = localStorage.getItem(STARRED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = isStarred ? list.filter((id) => id !== contact.id) : [...list, contact.id];
      localStorage.setItem(STARRED_KEY, JSON.stringify(next));
      setIsStarred(!isStarred);
    } catch { /* ignore */ }
  }

  function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url).then(
      () => toast("Link copied to clipboard.", "success"),
      () => toast("Couldn't copy link.", "error")
    );
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete contact?", message: `Delete ${displayName}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteContact(contact.id);
        toast("Contact deleted.", "success");
        router.push("/contacts");
      } catch {
        toast("Couldn't delete contact.", "error");
      }
    });
  }

  function handleExport(format: "pdf" | "csv") {
    setExportOpen(false);
    toast(`Exporting as ${format.toUpperCase()}…`, "info");
    const rows = [
      ["Field", "Value"],
      ["Name", displayName],
      ["Job Title", contact.job_title || ""],
      ["Company", contact.account?.account_name || ""],
      ["Email", contact.email || ""],
      ["Phone", contact.phone || ""],
      ["Address", mailing],
    ];
    if (format === "csv") {
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${displayName || "contact"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      window.print();
    }
  }

  const displayName = `${contact.first_name} ${contact.last_name}`.trim();
  const mailing = [contact.mailing_street, contact.mailing_city, contact.mailing_state, contact.mailing_zip, contact.mailing_country].filter(Boolean).join(", ");
  const tagsList = (contact.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const socialLinks: { label: string; value: string | null; icon: React.ComponentType<{ className?: string }>; href: (v: string) => string; bg: string }[] = [
    { label: "YouTube", value: contact.youtube, icon: Video, href: (v) => (v.startsWith("http") ? v : `https://youtube.com/${v}`), bg: "bg-red-600" },
    { label: "Facebook", value: contact.facebook, icon: Globe, href: (v) => (v.startsWith("http") ? v : `https://facebook.com/${v}`), bg: "bg-blue-600" },
    { label: "Instagram", value: contact.instagram, icon: Share2, href: (v) => (v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`), bg: "bg-pink-600" },
    { label: "Whatsapp", value: contact.whatsapp, icon: Phone, href: (v) => `https://wa.me/${v.replace(/\D/g, "")}`, bg: "bg-emerald-600" },
    { label: "Pinterest", value: contact.pinterest, icon: Pin, href: (v) => (v.startsWith("http") ? v : `https://pinterest.com/${v}`), bg: "bg-rose-700" },
    { label: "LinkedIn", value: contact.linkedin, icon: Link2, href: (v) => (v.startsWith("http") ? v : `https://linkedin.com/in/${v}`), bg: "bg-sky-700" },
    { label: "Twitter", value: contact.twitter, icon: AtSign, href: (v) => `https://x.com/${v.replace(/^@/, "")}`, bg: "bg-slate-800" },
    { label: "Skype", value: contact.skype_id, icon: MessageCircle, href: (v) => `skype:${v}?chat`, bg: "bg-cyan-600" },
  ];
  const ownerInfo = owners.find((o) => o.id === contact.contact_owner) ?? null;

  // Real activity feed — built from actual events (contact creation + notes),
  // not fabricated sample data. There's no dedicated activity-log table for
  // Contacts (see contact_notes migration comment), so this reuses what's real.
  const activityItems: { label: string; detail: string | null; time: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { label: "Contact created", detail: null, time: contact.created_at, icon: UserPlus, color: "bg-emerald-500" },
    ...notes.map((n) => ({
      label: `Note added by ${n.author_name || "Unknown"}`,
      detail: n.body,
      time: n.created_at,
      icon: n.files.length > 0 ? Paperclip : FileText,
      color: n.files.length > 0 ? "bg-amber-500" : "bg-blue-500",
    })),
    ...meetings.map((m) => ({
      label: `Meeting: ${m.title}`,
      detail: [m.location, m.description].filter(Boolean).join(" — ") || null,
      time: m.start_at,
      icon: Users,
      color: m.status === "canceled" ? "bg-slate-400" : "bg-orange-500",
    })),
    ...calls.map((c) => ({
      label: `${c.author_name || "Unknown"} logged a call — ${c.outcome}`,
      detail: c.notes,
      time: c.call_time,
      icon: PhoneCall,
      color: "bg-green-600",
    })),
  ].sort((a, b) => (activitySort === "newest" ? 1 : -1) * (new Date(b.time).getTime() - new Date(a.time).getTime()));

  const activityGroups: Record<string, typeof activityItems> = {};
  for (const item of activityItems) {
    const key = formatDate(item.time);
    (activityGroups[key] ||= []).push(item);
  }
  const activityDates = Object.keys(activityGroups).sort(
    (a, b) => (activitySort === "newest" ? 1 : -1) * (new Date(activityGroups[b][0].time).getTime() - new Date(activityGroups[a][0].time).getTime())
  );

  return (
    <div className="max-w-[1650px] mx-auto pb-10 text-slate-800 dark:text-slate-700">
      {/* Title + breadcrumb + page actions */}
      <div className="flex items-center justify-between mb-1 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight inline-flex items-center gap-2">
            Contacts
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">{totalCount}</span>
          </h1>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mt-1">
            <Link href="/dashboard" className="hover:text-slate-600">Home</Link>
            <span>&gt;</span>
            <Link href="/contacts" className="text-slate-600 dark:text-slate-600 hover:text-slate-800">Contacts</Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setExportOpen((v) => !v)} className="h-8 text-xs px-3 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </Button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                  <button onClick={() => handleExport("pdf")} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-[var(--muted)]">Export as PDF</button>
                  <button onClick={() => handleExport("csv")} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-[var(--muted)]">Export as CSV</button>
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh" className="h-8 w-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Link href="/contacts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700 mb-4 px-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Contacts
      </Link>

      {/* Contact card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("h-16 w-16 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-bold text-xl shadow-xs overflow-hidden", avatarPalette(displayName || contact.id).border, avatarPalette(displayName || contact.id).bg, avatarPalette(displayName || contact.id).text)}>
              {contact.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a static asset
                <img src={contact.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsOf(displayName)
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate tracking-tight dark:text-white">{displayName || "—"}</h1>
                <button onClick={toggleStar} title={isStarred ? "Remove from favourites" : "Add to favourites"} className="focus:outline-none flex-shrink-0">
                  <Star className={cn("h-4 w-4 transition-colors", isStarred ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600 hover:text-amber-400")} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1 text-xs text-slate-500 dark:text-slate-500">
                {contact.job_title && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {contact.job_title}</span>
                )}
                {contact.account?.account_name && (
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {contact.account.account_name}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {contact.visibility !== "public" && (
                  <span className="py-1 px-2.5 text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-md font-semibold border border-rose-100 dark:border-rose-900/30 flex items-center gap-1 shadow-sm">
                    <Lock className="h-3.5 w-3.5 flex-shrink-0" /> {contact.visibility === "private" ? "Private" : "Select People"}
                  </span>
                )}
                {contact.rating != null && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-500">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {contact.rating}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <button onClick={() => setDealOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Deal
            </button>
            <button
              onClick={() => {
                if (!contact.email) { toast("This contact has no email address.", "error"); return; }
                setComposeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              <Send className="h-3.5 w-3.5" /> Send Email
            </button>
            <a
              href={contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}` : undefined}
              onClick={(e) => { if (!contact.whatsapp) { e.preventDefault(); toast("This contact has no WhatsApp number on file.", "error"); } }}
              target="_blank"
              rel="noopener noreferrer"
              title="Message on WhatsApp"
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-[var(--muted)]"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <button onClick={() => setEditOpen(true)} title="Edit contact" className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-[var(--muted)]">
              <Pencil className="h-4 w-4" />
            </button>
            <div className="relative">
              <Button variant="outline" size="icon" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                    <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50">
                      <Trash2 className="h-3.5 w-3.5" /> Delete Record
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-12">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-3 tracking-wide">Contact Information</h6>

            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <InfoRow label="Email" value={contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">{contact.email}</a> : null} />
              <InfoRow label="Phone" value={contact.phone ? <a href={`tel:${contact.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">{contact.phone}</a> : null} />
              <InfoRow label="Address" value={mailing || null} />
              <InfoRow label="Created on" value={formatDateTime(contact.created_at)} />
            </div>

            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <InfoRow label="Language" value={contact.language} />
              <InfoRow label="Currency" value={contact.currency} />
              <InfoRow label="Source" value={contact.lead_source} />
            </div>

            {(contact.mobile || contact.department || contact.secondary_email || contact.description) && (
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                <InfoRow label="Mobile" value={contact.mobile} />
                <InfoRow label="Department" value={contact.department} />
                <InfoRow label="Secondary email" value={contact.secondary_email} />
                {contact.description && <InfoBlock label="Description" value={contact.description} />}
              </div>
            )}

            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Owner</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              {ownerInfo ? <OwnerRow name={ownerInfo.name} /> : <p className="text-xs text-slate-400 italic">No owner assigned.</p>}
            </div>

            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Tags</h6>
            {tagsList.length ? (
              <div className="flex flex-wrap gap-1.5">
                {tagsList.map((t) => (
                  <span key={t} className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", tagColor(t))}>{t}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No tags yet.</p>
            )}

            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
              <InfoRow label="Last Modified" value={formatDateTime(contact.updated_at)} />
            </div>
          </Card>

          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-700">Company</h3>
              <button onClick={() => setEditOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Add New
              </button>
            </div>
            {contact.account ? (
              <Link href={`/accounts/${contact.account.id}`} className="flex items-center gap-2.5 group">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[var(--muted)] flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0 overflow-hidden">
                  {contact.account.website ? (
                    // eslint-disable-next-line @next/next/no-img-element -- third-party favicon URL, not a static asset
                    <img src={`https://www.google.com/s2/favicons?domain=${contact.account.website.replace(/^https?:\/\//, "")}&sz=64`} alt="" className="h-5 w-5" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-700 group-hover:text-blue-600 truncate inline-flex items-center gap-1">
                    {contact.account.account_name} <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                  </p>
                  {contact.account.website && <p className="text-[11px] text-slate-400 truncate">{contact.account.website}</p>}
                </div>
              </Link>
            ) : (
              <p className="text-xs text-slate-400">No company linked.</p>
            )}
          </Card>

          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-700 mb-2.5">Social Profile</h3>
            <div className="flex items-center gap-2">
              {socialLinks.map(({ label, value, icon: Icon, href, bg }) => (
                <a
                  key={label}
                  href={value ? href(value) : undefined}
                  onClick={(e) => { if (!value) { e.preventDefault(); toast(`No ${label} on file.`, "info"); } }}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={value ? `${label}: ${value}` : `No ${label}`}
                  className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white flex-shrink-0", value ? bg : "bg-slate-200 dark:bg-[var(--muted)] text-slate-400 dark:text-slate-400 cursor-default")}
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </Card>

          <Card className="p-4 pb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl text-xs">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-700 mb-1">Settings</h3>
            <button onClick={handleShare} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
              <Share2 className="h-3.5 w-3.5 text-slate-400" /> Share Contact
            </button>
            <button onClick={toggleStar} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
              <Heart className={isStarred ? "h-3.5 w-3.5 fill-amber-500 text-amber-500" : "h-3.5 w-3.5 text-slate-400"} /> {isStarred ? "Remove from Favourite" : "Add to Favourite"}
            </button>
            <button onClick={handleDelete} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50">
              <Trash2 className="h-3.5 w-3.5" /> Delete Contact
            </button>
          </Card>
        </div>

        {/* Main — tabs */}
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="border-b border-slate-200 dark:border-slate-800 mb-4">
              <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
                {TABS.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 py-3 px-1 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors",
                        isActive ? "border-rose-500 text-rose-600 dark:text-rose-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700"
                      )}
                    >
                      <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {activeTab === "activities" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
                  <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Activities</h5>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setMeetingOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <CalendarPlus className="h-3 w-3" /> Schedule Meeting
                    </button>
                    <button onClick={() => setTaskOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <ListTodo className="h-3 w-3" /> Add Task
                    </button>
                    <Button variant="outline" size="sm" onClick={() => setActivitySort((s) => (s === "newest" ? "oldest" : "newest"))} className="h-7 text-[11px] px-2.5 gap-1">
                      <ArrowUpDown className="h-3 w-3" /> Sort: {activitySort === "newest" ? "Newest" : "Oldest"}
                    </Button>
                  </div>
                </div>
                {activityDates.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">No activity recorded yet.</p>
                ) : (
                  activityDates.map((dateStr) => (
                    <div key={dateStr} className="space-y-2.5">
                      <div className="inline-flex items-center gap-1 py-0.5 px-2 bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 text-[10px] font-bold border border-sky-100 dark:border-sky-900/20 rounded">
                        <Calendar className="h-3 w-3" /> {dateStr}
                      </div>
                      <div className="space-y-2">
                        {activityGroups[dateStr].map((item, i) => (
                          <Card key={i} className="p-3 bg-slate-50/50 dark:bg-[var(--muted)] border-slate-100 dark:border-slate-800/80 shadow-none rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white", item.color)}>
                                <item.icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-700">{item.label}</p>
                                {item.detail && <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-2">{item.detail}</p>}
                                <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(item.time)}</p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))
                )}

                <div className="pt-2">
                  <div className="inline-flex items-center gap-1 py-0.5 px-2 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-100 dark:border-blue-900/20 rounded mb-2.5">
                    <ListTodo className="h-3 w-3" /> Upcoming Activity
                  </div>
                  <ContactTasksCard contactId={contact.id} tasks={tasks} owners={owners} />
                </div>
              </div>
            )}

            {activeTab === "notes" && <ContactNotesCard contactId={contact.id} notes={notes} />}

            {activeTab === "calls" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
                    <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Meetings</h5>
                    <button onClick={() => setMeetingOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <CalendarPlus className="h-3 w-3" /> Schedule
                    </button>
                  </div>
                  {meetings.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-4">No meetings scheduled for this contact.</p>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {meetings.map((m) => (
                        <div
                          key={m.id}
                          className="w-full p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors flex items-center justify-between gap-3"
                        >
                          <button onClick={() => router.push(`/meetings?open=${m.id}`)} className="min-w-0 text-left flex-1">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-700 truncate">{m.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {formatDateTime(m.start_at)}
                              {m.location && <span>· {m.location}</span>}
                            </p>
                          </button>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {m.join_url && (
                              <a
                                href={m.join_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                <Video className="h-3 w-3" /> Join
                              </a>
                            )}
                            <Badge variant={m.status === "canceled" ? "default" : "blue"}>{m.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <ContactCallsCard contactId={contact.id} calls={calls} onAddNew={() => setCallOpen(true)} />
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-6">
                <ContactDocumentsCard contactId={contact.id} documents={documents} owners={owners} onAddNew={() => setDocumentOpen(true)} />

                <div>
                  <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs pb-2 border-b border-slate-100 dark:border-slate-800/80 mb-3">Files from Notes</h5>
                  <div className="space-y-2">
                    {notes.flatMap((n) => n.files.map((f) => ({ ...f, note: n }))).length === 0 ? (
                      <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                        <Paperclip className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 italic">No files attached to notes yet.</p>
                      </div>
                    ) : (
                      notes.flatMap((n) => n.files.map((f) => ({ ...f, note: n }))).map((f) => (
                        <div key={f.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 rounded flex items-center justify-center flex-shrink-0">
                              <FileIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-800 dark:text-slate-700 hover:underline truncate block">
                                {f.file_name || "Attached file"}
                              </a>
                              <p className="text-[9px] text-slate-400 mt-0.5">Uploaded by {f.note.author_name || "Unknown"} on {formatDateTime(f.note.created_at)}</p>
                            </div>
                          </div>
                          <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-blue-600 flex-shrink-0" title="Download file">
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "email" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
                  <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Email</h5>
                  {mailboxConnected && (
                    <button onClick={() => setComposeOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Create Email
                    </button>
                  )}
                </div>
                <ContactEmailCard contactId={contact.id} contactEmail={contact.email} emails={emails} mailboxConnected={mailboxConnected} />
              </div>
            )}
          </div>
        </div>
      </div>

      <EditContactModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} owners={owners} />
      <AddDealModal
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        contactId={contact.id}
        accountId={contact.account_id}
        contactName={displayName}
        contactEmail={contact.email}
        companyName={contact.account?.account_name ?? null}
        owners={owners}
      />
      <ScheduleMeetingModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        contactId={contact.id}
        contactName={displayName}
        contactEmail={contact.email}
      />
      <AddTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        contactId={contact.id}
        owners={owners}
      />
      <LogCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        contactId={contact.id}
      />
      <AddDocumentModal
        open={documentOpen}
        onClose={() => setDocumentOpen(false)}
        contactId={contact.id}
        owners={owners}
        deals={deals}
      />
      <ComposeEmailModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        contactId={contact.id}
        defaultTo={contact.email}
      />
    </div>
  );
}

const TAG_COLORS = [
  "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-400",
  "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-400",
  "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/40 dark:text-blue-400",
  "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-400",
  "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/40 dark:text-purple-400",
];

/** Deterministic color per tag TEXT (not per-contact) — the same tag word always
 *  gets the same color across every contact, so "VIP" reads consistently everywhere. */
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const AVATAR_PALETTE = [
  { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-500" },
  { border: "border-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-500" },
  { border: "border-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-500" },
  { border: "border-rose-400", bg: "bg-rose-50 dark:bg-rose-950/20", text: "text-rose-500" },
  { border: "border-purple-400", bg: "bg-purple-50 dark:bg-purple-950/20", text: "text-purple-500" },
  { border: "border-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/20", text: "text-cyan-500" },
];

/** Deterministic border/bg/text triple per record name, for the header's
 *  circle-avatar fallback (matches the Prospects screen's bordered-initials look). */
function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initialsOf(name: string): string {
  return (name || "?").trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

const OWNER_AVATAR_COLORS = [
  "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
];

function ownerAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return OWNER_AVATAR_COLORS[Math.abs(hash) % OWNER_AVATAR_COLORS.length];
}

function OwnerRow({ name }: { name: string }) {
  return (
    <div className="flex items-center">
      <div className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 flex-shrink-0", ownerAvatarColor(name))}>
        {initialsOf(name)}
      </div>
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-700">{name}</p>
    </div>
  );
}

/** Compact label-left/value-right row — the sidebar info card's default field
 *  layout, matching the Prospects screen's single-card design. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 text-xs py-1">
      <p className="text-slate-500 dark:text-slate-500 font-medium flex-shrink-0">{label}</p>
      <div className="text-slate-800 dark:text-slate-700 font-semibold text-right flex items-center justify-end gap-1.5 flex-wrap">{value ?? "—"}</div>
    </div>
  );
}

/** Stacked label-above-value block for longer free text (Description, Address). */
function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pt-2 text-xs">
      <p className="text-slate-500 dark:text-slate-500 font-medium mb-1">{label}</p>
      <p className="text-slate-800 dark:text-slate-700 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2 rounded-lg whitespace-pre-wrap font-medium">{value}</p>
    </div>
  );
}
