"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, MoreHorizontal, Mail, Building2, ExternalLink,
  Download, RefreshCw, ChevronDown, Star, Send, Share2, Heart, Plus, Paperclip,
  Calendar, ArrowLeft, Clock, FileText, PhoneCall,
  File as FileIcon, UserPlus, Users, Users2, CalendarPlus, ListTodo, ArrowUpDown,
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { EditAccountModal, type AccountOwnerOption } from "@/components/accounts/edit-account-modal";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { AccountNotesCard } from "@/components/accounts/account-notes-card";
import { AddDealModal } from "@/components/accounts/add-deal-modal";
import { ScheduleMeetingModal } from "@/components/accounts/schedule-meeting-modal";
import { AddTaskModal } from "@/components/accounts/add-task-modal";
import { AccountTasksCard } from "@/components/accounts/account-tasks-card";
import { LogCallModal } from "@/components/accounts/log-call-modal";
import { AccountCallsCard } from "@/components/accounts/account-calls-card";
import { AddDocumentModal } from "@/components/accounts/add-document-modal";
import { AccountDocumentsCard } from "@/components/accounts/account-documents-card";
import { AccountEmailCard } from "@/components/accounts/account-email-card";
import { ComposeEmailModal } from "@/components/accounts/compose-email-modal";
import { createAccountNote, type AccountNoteRow } from "@/lib/queries/account-notes";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { AccountTaskRow } from "@/lib/queries/account-tasks";
import type { AccountCallRow } from "@/lib/queries/account-calls";
import type { AccountDocumentRow } from "@/lib/queries/account-documents";
import type { AccountEmailRow } from "@/lib/queries/account-emails";
import type { OpportunityRow } from "@/lib/opportunities";
import { deleteAccount, type AccountRow } from "@/lib/queries/accounts";
import type { ContactRow } from "@/lib/queries/contacts";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const STARRED_KEY = "lp_starred_accounts";

type TabId = "activities" | "notes" | "calls" | "files" | "email";
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "activities", label: "Activities", icon: Clock },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "calls", label: "Calls", icon: PhoneCall },
  { id: "files", label: "Files", icon: FileIcon },
  { id: "email", label: "Email", icon: Mail },
];

export function AccountDetailView({
  account, contacts = [], owners = [], notes = [], meetings = [], tasks = [], calls = [], documents = [], emails = [], mailboxConnected = false, deals = [], totalCount = 0,
}: {
  account: AccountRow;
  contacts?: ContactRow[];
  owners?: AccountOwnerOption[];
  notes?: AccountNoteRow[];
  meetings?: MeetingRow[];
  tasks?: AccountTaskRow[];
  calls?: AccountCallRow[];
  documents?: AccountDocumentRow[];
  emails?: AccountEmailRow[];
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
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("activities");
  const [activitySort, setActivitySort] = useState<"newest" | "oldest">("newest");
  const attachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STARRED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount
      setIsStarred(list.includes(account.id));
    } catch { /* ignore */ }
  }, [account.id]);

  function toggleStar() {
    try {
      const raw = localStorage.getItem(STARRED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = isStarred ? list.filter((id) => id !== account.id) : [...list, account.id];
      localStorage.setItem(STARRED_KEY, JSON.stringify(next));
      setIsStarred(!isStarred);
    } catch { /* ignore */ }
  }

  async function handleQuickAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    const res = await createAccountNote(account.id, formData);
    if (res.ok) {
      toast("File attached — see it in Notes.", "success");
      router.refresh();
    } else {
      toast(res.error || "Couldn't attach file.", "error");
    }
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
    const ok = await confirm({ title: "Delete account?", message: `Delete ${account.account_name}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteAccount(account.id);
        toast("Account deleted.", "success");
        router.push("/accounts");
      } catch {
        toast("Couldn't delete account.", "error");
      }
    });
  }

  function handleExport(format: "pdf" | "csv") {
    setExportOpen(false);
    toast(`Exporting as ${format.toUpperCase()}…`, "info");
    const rows = [
      ["Field", "Value"],
      ["Account Name", account.account_name],
      ["Industry", account.industry || ""],
      ["Account Type", account.account_type || ""],
      ["Phone", account.phone || ""],
      ["Website", account.website || ""],
      ["Billing Address", billing],
    ];
    if (format === "csv") {
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${account.account_name || "account"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      window.print();
    }
  }

  const billing = [account.billing_street, account.billing_city, account.billing_state, account.billing_zip, account.billing_country].filter(Boolean).join(", ");
  const shipping = [account.shipping_street, account.shipping_city, account.shipping_state, account.shipping_zip, account.shipping_country].filter(Boolean).join(", ");
  const accountEmail = contacts.find((c) => c.email)?.email ?? null;
  const faviconHost = account.website ? account.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
  const ownerInfo = owners.find((o) => o.id === account.account_owner) ?? null;

  // Real activity feed — built from actual events (account creation + notes +
  // meetings + calls), not fabricated sample data, same approach as Contact's.
  const activityItems: { label: string; detail: string | null; time: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { label: "Account created", detail: null, time: account.created_at, icon: UserPlus, color: "bg-emerald-500" },
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
            Accounts
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">{totalCount}</span>
          </h1>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mt-1">
            <Link href="/dashboard" className="hover:text-slate-600">Home</Link>
            <span>&gt;</span>
            <Link href="/accounts" className="text-slate-600 dark:text-slate-600 hover:text-slate-800">Accounts</Link>
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

      <Link href="/accounts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700 mb-4 px-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Accounts
      </Link>

      {/* Account card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("h-16 w-16 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-bold text-xl shadow-xs overflow-hidden", avatarPalette(account.account_name || account.id).border, avatarPalette(account.account_name || account.id).bg, avatarPalette(account.account_name || account.id).text)}>
              {faviconHost ? (
                // eslint-disable-next-line @next/next/no-img-element -- third-party favicon URL, not a static asset
                <img src={`https://www.google.com/s2/favicons?domain=${faviconHost}&sz=128`} alt="" className="h-7 w-7" />
              ) : (
                initialsOf(account.account_name)
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate tracking-tight dark:text-white">{account.account_name || "—"}</h1>
                <button onClick={toggleStar} title={isStarred ? "Remove from favourites" : "Add to favourites"} className="focus:outline-none flex-shrink-0">
                  <Star className={cn("h-4 w-4 transition-colors", isStarred ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600 hover:text-amber-400")} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1 text-xs text-slate-500 dark:text-slate-500">
                {account.industry && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {account.industry}</span>
                )}
                {account.account_type && (
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {account.account_type}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {account.account_status && (
                  <span className="py-1 px-2.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md font-semibold border border-slate-200 dark:border-slate-700 shadow-sm">
                    {account.account_status}
                  </span>
                )}
                {account.rating && (
                  <Badge variant={account.rating === "Hot" ? "danger" : account.rating === "Warm" ? "warning" : "blue"}>{account.rating}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <button onClick={() => setDealOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Deal
            </button>
            <button
              onClick={() => {
                if (!accountEmail) { toast("No contact with an email is linked to this account.", "error"); return; }
                setComposeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
            >
              <Send className="h-3.5 w-3.5" /> Send Email
            </button>
            <input ref={attachRef} type="file" className="hidden" onChange={handleQuickAttach} />
            <button onClick={() => attachRef.current?.click()} title="Attach a file" className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-[var(--muted)]">
              <Paperclip className="h-4 w-4" />
            </button>
            <div className="relative">
              <Button variant="outline" size="icon" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                    <button onClick={() => { setMenuOpen(false); setEditOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
                      <Pencil className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> Edit Record
                    </button>
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
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-3 tracking-wide">Account Information</h6>

            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <InfoRow label="Phone" value={account.phone ? <a href={`tel:${account.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">{account.phone}</a> : null} />
              <InfoRow label="Website" value={account.website ? <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">{account.website} <ExternalLink className="h-3 w-3" /></a> : null} />
              <InfoRow label="Industry" value={account.industry} />
              <InfoRow label="Created on" value={formatDateTime(account.created_at)} />
            </div>

            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <InfoRow label="Account Type" value={account.account_type} />
              <InfoRow label="Employees" value={account.employees != null ? account.employees.toLocaleString() : null} />
              <InfoRow label="Annual Revenue" value={account.annual_revenue != null ? account.annual_revenue.toLocaleString() : null} />
              <InfoRow label="Ownership" value={account.ownership} />
            </div>

            {(account.ticker_symbol || account.description) && (
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                <InfoRow label="Ticker symbol" value={account.ticker_symbol} />
                {account.description && <InfoBlock label="Description" value={account.description} />}
              </div>
            )}

            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <InfoBlock label="Billing address" value={billing || "—"} />
              <InfoBlock label="Shipping address" value={shipping || "—"} />
            </div>

            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Owner</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              {ownerInfo ? <OwnerRow name={ownerInfo.name} /> : <p className="text-xs text-slate-400 italic">No owner assigned.</p>}
            </div>

            <div className="space-y-1 text-xs pt-1">
              <InfoRow label="Last Modified" value={formatDateTime(account.updated_at)} />
              <InfoRow label="Modified By" value={account.updated_by ? <OwnerRow name={account.updated_by} /> : null} />
            </div>
          </Card>

          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-700">Contacts ({contacts.length})</h3>
              <button onClick={() => setAddContactOpen(true)} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Add New
              </button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-400">No contacts linked to this account yet.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center gap-2.5 group p-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[var(--muted)]">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                      <Users2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-700 group-hover:text-blue-600 truncate inline-flex items-center gap-1">
                        {`${c.first_name} ${c.last_name}`.trim()} <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                      </p>
                      {c.job_title && <p className="text-[11px] text-slate-400 truncate">{c.job_title}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link href={`/contacts?account=${account.id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline pt-2.5">
              View All Contacts →
            </Link>
          </Card>

          <Card className="p-4 pb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl text-xs">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-700 mb-1">Settings</h3>
            <button onClick={handleShare} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
              <Share2 className="h-3.5 w-3.5 text-slate-400" /> Share Account
            </button>
            <button onClick={toggleStar} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
              <Heart className={isStarred ? "h-3.5 w-3.5 fill-amber-500 text-amber-500" : "h-3.5 w-3.5 text-slate-400"} /> {isStarred ? "Remove from Favourite" : "Add to Favourite"}
            </button>
            <button onClick={handleDelete} className="w-full flex items-center gap-2 px-1 py-2 rounded-lg text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50">
              <Trash2 className="h-3.5 w-3.5" /> Delete Account
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
                  <AccountTasksCard accountId={account.id} tasks={tasks} owners={owners} />
                </div>
              </div>
            )}

            {activeTab === "notes" && <AccountNotesCard accountId={account.id} notes={notes} />}

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
                    <p className="text-xs text-slate-400 italic text-center py-4">No meetings scheduled for this account.</p>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {meetings.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => router.push(`/meetings?open=${m.id}`)}
                          className="w-full text-left p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-700 truncate">{m.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {formatDateTime(m.start_at)}
                              {m.location && <span>· {m.location}</span>}
                            </p>
                          </div>
                          <Badge variant={m.status === "canceled" ? "default" : "blue"} className="flex-shrink-0">{m.status}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <AccountCallsCard accountId={account.id} calls={calls} onAddNew={() => setCallOpen(true)} />
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-6">
                <AccountDocumentsCard accountId={account.id} documents={documents} owners={owners} onAddNew={() => setDocumentOpen(true)} />

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
                    <button onClick={() => setComposeOpen(true)} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Create Email
                    </button>
                  )}
                </div>
                <AccountEmailCard accountId={account.id} accountEmail={accountEmail} emails={emails} mailboxConnected={mailboxConnected} />
              </div>
            )}
          </div>
        </div>
      </div>

      <EditAccountModal open={editOpen} onClose={() => setEditOpen(false)} account={account} owners={owners} />
      <EditContactModal open={addContactOpen} onClose={() => setAddContactOpen(false)} defaultAccountId={account.id} />
      <AddDealModal
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        accountId={account.id}
        accountName={account.account_name}
        contacts={contacts}
        owners={owners}
      />
      <ScheduleMeetingModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        accountId={account.id}
        accountName={account.account_name}
      />
      <AddTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        accountId={account.id}
        owners={owners}
      />
      <LogCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        accountId={account.id}
      />
      <AddDocumentModal
        open={documentOpen}
        onClose={() => setDocumentOpen(false)}
        accountId={account.id}
        owners={owners}
        deals={deals}
      />
      <ComposeEmailModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        accountId={account.id}
        defaultTo={accountEmail}
      />
    </div>
  );
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
