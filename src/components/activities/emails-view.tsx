"use client";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import {
  Search, Mail, Star, Trash2, Send, Tag, RefreshCw,
  Plus, X, Reply, AlertOctagon, Sparkles, Lock,
  ChevronLeft, ChevronRight, Inbox, FileText, CheckSquare, Square, Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { InboxConversation } from "@/lib/queries/inbox";
import { sendReply, sendComposedEmail } from "@/lib/queries/inbox";
import { generateComposeEmail } from "@/lib/ai/actions";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import { useFeatureKillSwitch } from "@/lib/hooks/use-feature-kill-switch";

// Email bodies come from external senders — HTML but untrusted. Sanitize
// before rendering with dangerouslySetInnerHTML; allowlist is broader than a
// simple note's (real emails use div/table/blockquote/img for quoted replies
// and signatures) but still excludes anything that can execute script or
// load a form. Plain-text emails (no tags) pass through unchanged and still
// get their line breaks from the container's `whitespace-pre-line` class.
const EMAIL_SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "img", "hr", "font",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "style", "src", "alt", "width", "height", "align", "dir",
    "colspan", "rowspan", "border", "cellpadding", "cellspacing", "class",
  ],
};
function safeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, EMAIL_SANITIZE_OPTS);
}
// List-row preview is a line-clamped snippet, not a reading pane — strip
// tags entirely rather than render HTML that would get cut off mid-markup.
function stripHtmlForPreview(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, " ").trim();
}

interface EmailItem {
  id: string;
  leadId: string | null;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  date: string;
  time: string;
  starred: boolean;
  folder: "Inbox" | "Starred" | "Sent" | "Drafts" | "Spam" | "Trash";
  label: "Clients" | "Important" | "Personal" | "Work" | "Finance" | null;
  unread: boolean;
  recipients?: string;
}

const AVATAR_COLORS = [
  "bg-blue-600 dark:bg-blue-700",
  "bg-emerald-600 dark:bg-emerald-700",
  "bg-indigo-600 dark:bg-indigo-700",
  "bg-violet-600 dark:bg-violet-700",
  "bg-rose-600 dark:bg-rose-700",
  "bg-cyan-600 dark:bg-cyan-700",
  "bg-amber-600 dark:bg-amber-700",
];

const LABEL_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  Clients: { dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/40" },
  Important: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/40" },
  Personal: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  Work: { dot: "bg-purple-500", text: "text-purple-700 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-950/40" },
  Finance: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40" },
};

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatConversation(m: InboxConversation, folder: "Inbox" | "Sent", currentUserName: string): EmailItem {
  const d = new Date(m.created_at);
  const isInbox = folder === "Inbox";
  return {
    id: m.id,
    leadId: m.lead_id,
    senderName: isInbox ? (m.lead_name || "Unknown") : currentUserName,
    senderEmail: isInbox ? (m.lead_email || "") : "",
    subject: m.subject || "No Subject",
    body: m.body || "No message body.",
    date: d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    starred: false,
    folder,
    label: null,
    unread: isInbox ? !m.is_read : false,
    recipients: isInbox ? undefined : (m.lead_name || m.lead_email || undefined),
  };
}

export function EmailsView({
  inbox,
  sent,
  currentUserName,
}: {
  inbox: InboxConversation[];
  sent: InboxConversation[];
  currentUserName: string;
}) {
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [isSending, startSend] = useTransition();
  const { enabled: sendEmailEnabled } = useFeatureKillSwitch("send_email");

  // Real data only, seeded once — local overlay (starred/label/spam/trash moves)
  // lives on top of it since none of that has real backing yet.
  const [emails, setEmails] = useState<EmailItem[]>(() => [
    ...inbox.map((m) => formatConversation(m, "Inbox", currentUserName)),
    ...sent.map((m) => formatConversation(m, "Sent", currentUserName)),
  ]);

  const [currentFolder, setCurrentFolder] = useState<EmailItem["folder"]>("Inbox");
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const EMAILS_PER_PAGE = 10;

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeLabel, setComposeLabel] = useState<EmailItem["label"]>(null);
  // Set when replying to an existing conversation — sends via that lead's real
  // channel (email or LinkedIn). Null for a fresh Compose, which sends to
  // whatever address is typed and only ties to a lead if one matches.
  const [replyToLeadId, setReplyToLeadId] = useState<string | null>(null);
  // AI draft — asking for the user's own instruction before generating,
  // instead of always writing the same generic opener text.
  const [drafting, setDrafting] = useState(false);
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");
  // The reply/forward context to ground the AI draft in, so it stays on-topic
  // with the thread instead of writing a generic email from nothing.
  const [draftThreadContext, setDraftThreadContext] = useState<{ replyingToName?: string; originalSubject?: string; originalBody?: string } | null>(null);

  const filteredEmails = useMemo(() => {
    return emails.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.body.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (currentLabel) return item.label === currentLabel;
      if (currentFolder === "Starred") return item.starred;
      return item.folder === currentFolder;
    });
  }, [emails, currentFolder, currentLabel, searchQuery]);

  const selectedEmail = useMemo(() => {
    return filteredEmails.find((e) => e.id === selectedEmailId)
      || (filteredEmails.length > 0 ? filteredEmails[0] : null);
  }, [filteredEmails, selectedEmailId]);

  const folderCounts = useMemo(() => ({
    Inbox: emails.filter((e) => e.folder === "Inbox" && e.unread).length,
    Starred: emails.filter((e) => e.starred).length,
    Sent: emails.filter((e) => e.folder === "Sent").length,
    Drafts: 0,
    Spam: emails.filter((e) => e.folder === "Spam").length,
    Trash: emails.filter((e) => e.folder === "Trash").length,
  }), [emails]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / EMAILS_PER_PAGE));
  const pageEmails = useMemo(() => {
    const startIndex = (currentPage - 1) * EMAILS_PER_PAGE;
    return filteredEmails.slice(startIndex, startIndex + EMAILS_PER_PAGE);
  }, [filteredEmails, currentPage]);

  const pagedRangeText = useMemo(() => {
    if (filteredEmails.length === 0) return "0 of 0";
    const start = (currentPage - 1) * EMAILS_PER_PAGE + 1;
    const end = Math.min(currentPage * EMAILS_PER_PAGE, filteredEmails.length);
    return `${start}-${end} of ${filteredEmails.length}`;
  }, [filteredEmails, currentPage]);

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEmails((prev) => prev.map((item) => (item.id === id ? { ...item, starred: !item.starred } : item)));
  };

  const handleRefresh = () => {
    toast("Refreshing…", "info");
    router.refresh();
    setTimeout(() => window.location.reload(), 100);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === pageEmails.length) setSelectedIds([]);
    else setSelectedIds(pageEmails.map((item) => item.id));
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkMoveToTrash = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: "Move to Trash?",
      message: `Move ${selectedIds.length} selected conversation(s) to Trash?`,
      confirmLabel: "Move to Trash",
      danger: true,
    });
    if (!ok) return;
    setEmails((prev) => prev.map((item) => (selectedIds.includes(item.id) ? { ...item, folder: "Trash" } : item)));
    setSelectedIds([]);
    toast("Moved to Trash.", "success");
  };

  const handleBulkStar = () => {
    if (selectedIds.length === 0) return;
    setEmails((prev) => prev.map((item) => (selectedIds.includes(item.id) ? { ...item, starred: true } : item)));
    setSelectedIds([]);
    toast("Starred selected emails.", "success");
  };

  const handleBulkLabel = (lbl: EmailItem["label"]) => {
    if (selectedIds.length === 0) return;
    setEmails((prev) => prev.map((item) => (selectedIds.includes(item.id) ? { ...item, label: lbl } : item)));
    setSelectedIds([]);
    toast(`Labeled as ${lbl}.`, "success");
  };

  const deleteSingle = async (id: string) => {
    const item = emails.find((e) => e.id === id);
    if (!item) return;
    if (item.folder === "Trash") {
      const ok = await confirm({
        title: "Delete permanently?",
        message: "Remove this from view permanently? This can't be undone.",
        confirmLabel: "Delete permanently",
        danger: true,
      });
      if (!ok) return;
      setEmails((prev) => prev.filter((e) => e.id !== id));
      toast("Removed.", "success");
    } else {
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder: "Trash" } : e)));
      toast("Moved to Trash.", "success");
    }
  };

  const moveSingleToSpam = (id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder: "Spam" } : e)));
    toast("Marked as Spam.", "success");
  };

  const openCompose = () => {
    setReplyToLeadId(null);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeLabel(null);
    setDraftThreadContext(null);
    setDraftPromptOpen(false);
    setDraftInstruction("");
    setIsComposeOpen(true);
  };

  const runDraft = async (instruction: string) => {
    setDrafting(true);
    try {
      const draft = await generateComposeEmail(instruction, {
        recipientEmail: composeTo || undefined,
        ...(draftThreadContext || {}),
      });
      setComposeSubject(draft.subject);
      setComposeBody(draft.body);
      notifyCreditsChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI draft failed.", "error");
    } finally {
      setDrafting(false);
      setDraftPromptOpen(false);
      setDraftInstruction("");
    }
  };

  const handleDraftInstructionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (!draftInstruction.trim()) return;
    runDraft(draftInstruction.trim());
  };

  const handleComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyToLeadId && !composeTo.trim()) {
      toast("Please enter a recipient.", "error");
      return;
    }
    if (!composeSubject.trim()) {
      toast("Please enter a subject.", "error");
      return;
    }

    startSend(async () => {
      const result = replyToLeadId
        ? await sendReply(replyToLeadId, composeSubject, composeBody)
        : await sendComposedEmail(composeTo, composeSubject, composeBody);

      if (!result.ok) {
        toast(result.error || "Failed to send.", "error");
        return;
      }

      toast(result.simulated ? "Email sent (dev simulation — no provider configured)." : "Email sent!", "success");
      setIsComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeLabel(null);
      setReplyToLeadId(null);
      // `emails` is local state seeded once from props (see its declaration) —
      // router.refresh() alone re-fetches the server data but this component
      // never re-mounts, so the new Sent row was invisible until a manual hard
      // reload. Same fix already used by the Refresh button (handleRefresh).
      router.refresh();
      setTimeout(() => window.location.reload(), 100);
    });
  };

  const initiateReply = (mode: "reply" | "forward") => {
    if (!selectedEmail) return;

    if (mode === "reply") {
      setReplyToLeadId(selectedEmail.leadId);
      setComposeTo(selectedEmail.senderEmail);
      setComposeSubject(selectedEmail.subject.startsWith("Re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject}`);
      setComposeBody(`\n\nOn ${selectedEmail.date} at ${selectedEmail.time}, ${selectedEmail.senderName} wrote:\n> ${selectedEmail.body.split("\n").join("\n> ")}`);
      setDraftThreadContext({ replyingToName: selectedEmail.senderName, originalSubject: selectedEmail.subject, originalBody: selectedEmail.body });
    } else {
      setReplyToLeadId(null);
      setComposeTo("");
      setComposeSubject(`Fwd: ${selectedEmail.subject}`);
      setComposeBody(`\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.senderName} <${selectedEmail.senderEmail}>\nDate: ${selectedEmail.date} at ${selectedEmail.time}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.body}`);
      setDraftThreadContext(null);
    }
    setIsComposeOpen(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Email</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Real conversations with your leads — sending here delivers for real.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-170px)] gap-4 overflow-hidden">

        {/* Folders & Labels Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            <Button
              onClick={openCompose}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="h-4 w-4" /> Compose
            </Button>

            <div className="space-y-1">
              {([
                { name: "Inbox", icon: Inbox, folder: "Inbox" },
                { name: "Starred", icon: Star, folder: "Starred" },
                { name: "Sent", icon: Send, folder: "Sent" },
                { name: "Drafts", icon: FileText, folder: "Drafts" },
                { name: "Spam", icon: AlertOctagon, folder: "Spam" },
                { name: "Trash", icon: Trash2, folder: "Trash" },
              ] as const).map((item) => {
                const Icon = item.icon;
                const active = currentFolder === item.folder && !currentLabel;
                const count = folderCounts[item.folder];
                return (
                  <button
                    key={item.name}
                    onClick={() => { setCurrentFolder(item.folder); setCurrentLabel(null); setCurrentPage(1); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all",
                      active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-650 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </div>
                    {count > 0 && (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", active ? "bg-white/20 text-white" : "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400")}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Labels</p>
              <div className="space-y-1">
                {(["Clients", "Important", "Personal", "Work", "Finance"] as const).map((lbl) => {
                  const active = currentLabel === lbl;
                  const color = LABEL_COLORS[lbl];
                  return (
                    <button
                      key={lbl}
                      onClick={() => { setCurrentLabel(active ? null : lbl); setCurrentPage(1); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all",
                        active ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-655 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--muted)]"
                      )}
                    >
                      <span className={cn("h-2.5 w-2.5 rounded-full", color.dot)} />
                      <span>{lbl}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Email Preview List */}
        <div className="w-full lg:w-[420px] flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/20">
            <div className="flex items-center gap-2">
              <button onClick={handleSelectAll} className="p-1.5 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700" title="Select all">
                {selectedIds.length === pageEmails.length && pageEmails.length > 0 ? (
                  <CheckSquare className="h-4.5 w-4.5 text-indigo-600" />
                ) : (
                  <Square className="h-4.5 w-4.5" />
                )}
              </button>
              <button onClick={handleRefresh} className="p-1.5 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-550 hover:text-slate-700" title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-2">
                  <button onClick={handleBulkStar} className="p-1.5 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700" title="Star selected">
                    <Star className="h-4 w-4" />
                  </button>
                  <button onClick={handleBulkMoveToTrash} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/50 text-slate-400 hover:text-rose-600" title="Delete selected">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="relative group">
                    <button className="p-1.5 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700" title="Apply label">
                      <Tag className="h-4 w-4" />
                    </button>
                    <div className="absolute left-0 mt-1 hidden group-hover:block z-30 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1">
                      {(["Clients", "Important", "Personal", "Work", "Finance"] as const).map((lbl) => (
                        <button key={lbl} onClick={() => handleBulkLabel(lbl)} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", LABEL_COLORS[lbl].dot)} />
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-450 tabular-nums">{pagedRangeText}</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="p-1 rounded-md text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="p-1 rounded-md text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <Input
              leftIcon={<Search className="h-4 w-4 text-slate-400" />}
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-9 text-xs rounded-xl"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {pageEmails.length === 0 && (
              <div className="p-8 text-center text-slate-450 text-xs font-semibold">
                No conversations in {currentLabel ? `Label: "${currentLabel}"` : `Folder: "${currentFolder}"`}.
              </div>
            )}
            {pageEmails.map((item) => {
              const active = selectedEmailId ? selectedEmailId === item.id : selectedEmail?.id === item.id;
              const initials = getInitials(item.senderName);
              const avatarCol = getAvatarColor(item.senderName);
              const labelColor = item.label ? LABEL_COLORS[item.label] : null;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedEmailId(item.id)}
                  className={cn(
                    "p-3.5 cursor-pointer relative hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-all flex gap-3",
                    active ? "bg-indigo-50/30 dark:bg-indigo-950/20" : "",
                    item.unread ? "font-semibold" : ""
                  )}
                >
                  {item.unread && <span className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />}
                  <div className="flex flex-col items-center justify-start gap-2.5 pt-0.5">
                    <button onClick={(e) => toggleSelect(item.id, e)} className="text-slate-350 hover:text-slate-500">
                      {selectedIds.includes(item.id) ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                    </button>
                    <button onClick={(e) => toggleStar(item.id, e)} className={cn("hover:text-amber-500 transition-colors", item.starred ? "text-amber-500 fill-amber-500" : "text-slate-300")}>
                      <Star className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", avatarCol)}>
                          {initials}
                        </span>
                        <span className="text-slate-900 dark:text-white text-xs truncate font-bold">{item.senderName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{item.date}</span>
                    </div>
                    <p className={cn("text-slate-900 dark:text-white text-xs truncate mb-1", item.unread ? "font-bold" : "font-semibold")}>{item.subject}</p>
                    <p className="text-slate-550 dark:text-slate-550 text-[11px] line-clamp-2 leading-relaxed">{stripHtmlForPreview(item.body)}</p>
                    {labelColor && (
                      <div className="mt-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold", labelColor.text, labelColor.bg)}>{item.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Email Reader */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-1.5">
                  <Button onClick={() => initiateReply("reply")} size="sm" className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 h-8 text-xs">
                    <Reply className="h-3.5 w-3.5" /> Reply
                  </Button>
                  <Button variant="outline" onClick={() => initiateReply("forward")} size="sm" className="rounded-xl h-8 text-xs border-slate-200 dark:border-slate-800 font-semibold">
                    Forward
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleStar(selectedEmail.id)} className={cn("p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500", selectedEmail.starred && "text-amber-500")} title="Star / Unstar">
                    <Star className="h-4 w-4" />
                  </button>
                  <button onClick={() => moveSingleToSpam(selectedEmail.id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650" title="Report Spam">
                    <AlertOctagon className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteSingle(selectedEmail.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/50 text-slate-400 hover:text-rose-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{selectedEmail.subject}</h2>
                  {selectedEmail.label && (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold", LABEL_COLORS[selectedEmail.label].text, LABEL_COLORS[selectedEmail.label].bg)}>{selectedEmail.label}</span>
                    </div>
                  )}
                </div>
                <div className="border-b border-slate-100 dark:border-slate-800" />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={cn("h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold", getAvatarColor(selectedEmail.senderName))}>
                      {getInitials(selectedEmail.senderName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {selectedEmail.senderName}
                        {selectedEmail.senderEmail && <span className="text-xs font-normal text-slate-400 ml-1.5">&lt;{selectedEmail.senderEmail}&gt;</span>}
                      </p>
                      {selectedEmail.recipients && <p className="text-[11px] text-slate-550 truncate mt-0.5">To: {selectedEmail.recipients}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-550 dark:text-slate-500">{selectedEmail.date}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{selectedEmail.time}</p>
                  </div>
                </div>
                <div
                  className="text-slate-800 dark:text-slate-700 text-sm leading-relaxed whitespace-pre-line font-medium py-2 [&_a]:text-blue-600 [&_a]:underline [&_img]:max-w-full [&_table]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: safeEmailHtml(selectedEmail.body) }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-450 p-8">
              <Mail className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold">Select an email to read</p>
            </div>
          )}
        </div>
      </div>

      {isComposeOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50" onClick={() => setIsComposeOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <Card className="w-full max-w-2xl p-5 pointer-events-auto rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="h-4.5 w-4.5 text-indigo-600" /> {replyToLeadId ? "Reply" : "New Message"}
                </h3>
                <button onClick={() => setIsComposeOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleComposeSubmit} className="space-y-4 flex-1 flex flex-col overflow-hidden">
                <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-655 dark:text-slate-455 uppercase mb-1.5">To</label>
                    <Input
                      required={!replyToLeadId}
                      disabled={Boolean(replyToLeadId)}
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder="email@example.com"
                      className="rounded-xl h-9.5 text-sm"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-655 dark:text-slate-455 uppercase">Subject</label>
                      {!draftPromptOpen && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDraftPromptOpen(true)} disabled={drafting} className="h-7 px-2 text-xs font-bold hover:text-indigo-600">
                          {drafting ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5 text-indigo-600 animate-pulse" /> AI write it for me
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <Input required value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Enter subject line..." className="rounded-xl h-9.5 text-sm" />
                  </div>

                  {draftPromptOpen && (
                    <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/50 rounded-xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-450 text-xs font-bold tracking-wider">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-650 dark:text-indigo-400" />
                          <span>AI EMAIL COMPOSER</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftPromptOpen(false);
                            setDraftInstruction("");
                          }}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="relative flex gap-2">
                        <Input
                          autoFocus
                          value={draftInstruction}
                          onChange={(e) => setDraftInstruction(e.target.value)}
                          onKeyDown={handleDraftInstructionKeyDown}
                          placeholder="What should this email say? (e.g. Follow up on demo, introduce product)"
                          className="flex-1 rounded-xl text-sm border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 h-10 shadow-sm"
                        />
                        <Button
                          type="button"
                          onClick={() => {
                            if (draftInstruction.trim()) {
                              runDraft(draftInstruction.trim());
                            }
                          }}
                          disabled={drafting || !draftInstruction.trim()}
                          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-4 gap-1.5 cursor-pointer shadow-sm transition-all active:scale-98"
                        >
                          {drafting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              <span>Write</span>
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          "Follow up after meeting",
                          "Introduce our product",
                          "Schedule a demo call",
                          "Send pricing proposal"
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setDraftInstruction(suggestion)}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 hover:border-indigo-350 hover:text-indigo-650 dark:hover:border-indigo-700 dark:hover:text-indigo-400 transition-all cursor-pointer hover:shadow-xs"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-655 dark:text-slate-455 uppercase mb-1.5">Label (Optional)</label>
                    <select
                      value={composeLabel || ""}
                      onChange={(e) => setComposeLabel((e.target.value || null) as EmailItem["label"])}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-350 outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                    >
                      <option value="">No Label</option>
                      <option value="Clients">Clients</option>
                      <option value="Important">Important</option>
                      <option value="Personal">Personal</option>
                      <option value="Work">Work</option>
                      <option value="Finance">Finance</option>
                    </select>
                  </div>
                  <div className="flex-1 min-h-[220px] flex flex-col">
                    <label className="block text-xs font-bold text-slate-655 dark:text-slate-455 uppercase mb-1.5">Message</label>
                    <textarea
                      required
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Type your message here..."
                      className="flex-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-800 outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)] resize-none font-medium leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 flex-shrink-0">
                  <Button type="button" variant="outline" onClick={() => setIsComposeOpen(false)} className="rounded-xl px-4 py-2 font-semibold text-sm border-slate-200 dark:border-slate-800 h-10">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!sendEmailEnabled || isSending}
                    title={!sendEmailEnabled ? "Sending email has been temporarily disabled by the administrator." : undefined}
                    className="rounded-xl px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 shadow-sm"
                  >
                    {isSending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>) : !sendEmailEnabled ? (<><Lock className="h-4 w-4" /> Send Message</>) : "Send Message"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
