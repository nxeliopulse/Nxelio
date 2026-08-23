"use client";
import { useState, useRef, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, X, Mail, Phone, Globe, Calendar, Star, Send, Building2,
  Target, Users, BarChart3, FileDown, MailOpen, Lock, ThumbsUp,
  Mouse, Briefcase, Pencil, CalendarDays, ChevronDown, ChevronUp, Paperclip, Trash2,
  RefreshCw, Sparkles, Filter, CheckCircle2, UserCheck, Plus, ExternalLink, History as HistoryIcon, Megaphone, Info,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { ProspectScoreTab } from "@/components/leads/tabs/prospect-score";
import { SendEmailModal } from "@/components/leads/send-email-modal";
import { ConvertLeadModal } from "@/components/leads/convert-lead-modal";
import { EditLeadModal } from "@/components/leads/edit-lead-modal";
import { FindEmailPicker } from "@/components/leads/find-email-picker";
import type { LeadRow } from "@/lib/queries/leads";
import { updateLead, updateLeadStatus } from "@/lib/queries/leads";
import { STAGE_LABELS, type OpportunityRow } from "@/lib/opportunities";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { LeadHistory } from "@/lib/queries/lead-detail";
import type { LeadCampaignSummary } from "@/lib/queries/campaigns";
import { createLeadNote, deleteLeadNote, type LeadNoteRow } from "@/lib/queries/lead-notes";
import { formatDate, formatDateTime, cn, toAbsoluteUrl } from "@/lib/utils";
import { allowedNextStatuses, isManualStatusTransitionAllowed, statusTransitionError } from "@/lib/leads/status-flow";
import { notifyUser } from "@/lib/queries/notifications";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Two-letter avatar initials from a name, "—" if there's no name to show. */
function initialsFor(name: string | null | undefined): string {
  if (!name) return "—";
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/** Same real status vocabulary/colors as the Prospects table's StatusPill. */
const STATUS_PILL_STYLE: Record<string, string> = {
  New: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400",
  Contacted: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400",
  Qualified: "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400",
  Nurturing: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  Converted: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
};
function statusPillStyle(status: string): string {
  return STATUS_PILL_STYLE[status] || "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-600";
}

export interface Activity {
  id: string;
  activity_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const activityMeta: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  PAGE_VISITED: { label: "Visited a page", color: "bg-blue-500", icon: BarChart3 },
  EMAIL_SENT: { label: "Sent email", color: "bg-blue-600", icon: Send },
  EMAIL_OPENED: { label: "Opened email", color: "bg-emerald-500", icon: MailOpen },
  EMAIL_CLICKED: { label: "Clicked link in email", color: "bg-cyan-500", icon: Mouse },
  EMAIL_REPLIED: { label: "Replied to outreach", color: "bg-teal-500", icon: Send },
  EMAIL_BOUNCED: { label: "Email bounced", color: "bg-rose-500", icon: MailOpen },
  EMAIL_UNSUBSCRIBED: { label: "Unsubscribed", color: "bg-slate-500", icon: MailOpen },
  CONVERTED_TO_OPPORTUNITY: { label: "Converted to opportunity", color: "bg-emerald-600", icon: Target },
  GUIDE_DOWNLOADED: { label: "Downloaded resource guide", color: "bg-indigo-500", icon: FileDown },
  WEBINAR_ATTENDED: { label: "Attended live webinar", color: "bg-amber-500", icon: Calendar },
  CONSULTATION_REQUESTED: { label: "Requested consultation", color: "bg-pink-500", icon: Calendar },
  LEAD_SCORE_UPDATED: { label: "AI Score updated", color: "bg-indigo-500", icon: Target },
  LEAD_CREATED: { label: "Contact record created", color: "bg-slate-400", icon: Users },
  STATUS_CHANGED: { label: "Status changed", color: "bg-indigo-500", icon: HistoryIcon },
};

/** STATUS_CHANGED carries who/what/why in metadata — build a readable label from it instead of the static one above. */
function statusChangeLabel(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const from = typeof metadata.from_status === "string" ? metadata.from_status : "—";
  const to = typeof metadata.to_status === "string" ? metadata.to_status : "—";
  const reason = typeof metadata.reason === "string" ? metadata.reason : "";
  const by = typeof metadata.changed_by === "string" ? metadata.changed_by : null;
  return `Status changed from ${from} to ${to}${by ? ` by ${by}` : ""}${reason ? ` — "${reason}"` : ""}`;
}

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
  lead: initialLead,
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
  const { confirm, toast, prompt } = useFeedback();

  // Local sync for interactive status updates
  const [lead, setLead] = useState<LeadRow>(initialLead);
  const [converted, setConverted] = useState(lead.status === "Converted");
  const [email, setEmail] = useState(lead.email);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs local state when the parent passes a new lead after a router refresh, without remounting this component
    setLead(initialLead);
    setConverted(initialLead.status === "Converted");
    setEmail(initialLead.email);
  }, [initialLead]);

  // Modal controls
  const [emailOpen, setEmailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showAiScoreDrawer, setShowAiScoreDrawer] = useState(false);
  const [findEmailOpen, setFindEmailOpen] = useState(false);

  // Tab controls & state
  const [activeTab, setActiveTab] = useState<"activities" | "notes" | "calls" | "email">("activities");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewingEmail, setViewingEmail] = useState<{ subject?: string; body?: string; to?: string; sentAt: string } | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  // Priority/Tags/Projects — persisted on the lead row itself (see
  // 0117_lead_tags_priority_projects.sql). Previously these were fake:
  // Priority reset to "High" on every reload, Tags/Projects always showed
  // the same two hardcoded labels regardless of the lead.
  async function handlePriorityChange(newPriority: "High" | "Medium" | "Low") {
    try {
      await updateLead(lead.id, { priority: newPriority });
      setLead((l) => ({ ...l, priority: newPriority }));
      toast(`Priority set to ${newPriority}.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update priority.", "error");
    }
  }

  async function handleAddTag() {
    const tag = await prompt({ title: "Add a tag", label: "Tag", placeholder: "e.g. VIP", confirmLabel: "Add", required: true });
    if (!tag) return;
    const next = [...new Set([...(lead.tags || []), tag.trim()])];
    try {
      await updateLead(lead.id, { tags: next });
      setLead((l) => ({ ...l, tags: next }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add tag.", "error");
    }
  }

  async function handleRemoveTag(tag: string) {
    const next = (lead.tags || []).filter((t) => t !== tag);
    try {
      await updateLead(lead.id, { tags: next });
      setLead((l) => ({ ...l, tags: next }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove tag.", "error");
    }
  }

  async function handleAddProject() {
    const project = await prompt({ title: "Add a project", label: "Project", placeholder: "e.g. Q3 Expansion", confirmLabel: "Add", required: true });
    if (!project) return;
    const next = [...new Set([...(lead.projects || []), project.trim()])];
    try {
      await updateLead(lead.id, { projects: next });
      setLead((l) => ({ ...l, projects: next }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add project.", "error");
    }
  }

  async function handleRemoveProject(project: string) {
    const next = (lead.projects || []).filter((p) => p !== project);
    try {
      await updateLead(lead.id, { projects: next });
      setLead((l) => ({ ...l, projects: next }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove project.", "error");
    }
  }

  // Notes state
  const [noteBody, setNoteBody] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [notePending, startNoteTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const displayName = lead.full_name || lead.company_name || "—";
  const firstName = lead.first_name || displayName.split(" ")[0] || "";

  // Generate dynamic initials for the avatar
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Locks manual Status edits while this lead is part of a currently
  // Running/Active campaign, so nobody contradicts what a live send
  // sequence is doing to it mid-flight.
  const campaignLocked = campaigns.some((c) => c.status === "Active");
  // "Converted" is a dead end — only the Convert button may set it, and once
  // set nothing may manually change status away from it. See status-flow.ts.
  const statusDeadEnd = lead.status === "Converted";
  const statusLocked = campaignLocked || statusDeadEnd;

  // Opens the status-change modal, pre-selecting the first status this lead is
  // actually allowed to move to next (status-flow.ts's real transition rules).
  const openStatusModal = () => {
    if (statusLocked) return;
    const next = allowedNextStatuses(lead.status);
    if (next.length === 0) return;
    setPendingStatus(next[0]);
    setStatusReason("");
    setNotifyOwner(true);
    setStatusModalOpen(true);
  };

  // Confirms the pending status change — requires a reason, logged with who
  // made the change. Rejects anything status-flow.ts doesn't allow (e.g.
  // jumping straight to "Converted") — enforced again server-side in
  // updateLeadStatus(), this is just the immediate/clear UI-level rejection.
  const confirmStatusChange = async () => {
    if (!pendingStatus || pendingStatus === lead.status) { setStatusModalOpen(false); return; }
    if (!isManualStatusTransitionAllowed(lead.status, pendingStatus)) {
      toast(statusTransitionError(lead.status, pendingStatus), "error");
      return;
    }
    if (!statusReason.trim()) {
      toast("Add a reason for this change.", "error");
      return;
    }
    setStatusSaving(true);
    try {
      await updateLeadStatus(lead.id, pendingStatus, statusReason.trim());
      if (notifyOwner && lead.owner_id) {
        await notifyUser(lead.owner_id, {
          type: "lead_status_changed",
          title: `${displayName || "A lead"} moved to ${pendingStatus}`,
          message: statusReason.trim(),
          link: `/leads/${lead.id}`,
        });
      }
      setLead((l) => ({ ...l, status: pendingStatus }));
      toast(`Status updated to ${pendingStatus}.`, "success");
      setStatusModalOpen(false);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update status.", "error");
    } finally {
      setStatusSaving(false);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async () => {
    const nextFavorite = !lead.is_favorite;
    setLead((l) => ({ ...l, is_favorite: nextFavorite }));
    try {
      await updateLead(lead.id, { is_favorite: nextFavorite });
      toast(nextFavorite ? "Added to favorites." : "Removed from favorites.", "success");
      router.refresh();
    } catch (e) {
      setLead((l) => ({ ...l, is_favorite: !nextFavorite }));
      toast("Couldn't update favorite status.", "error");
    }
  };

  // Submit note handler
  const handleAddNote = () => {
    if (!noteBody.trim()) return;
    const formData = new FormData();
    formData.set("body", noteBody.trim());
    if (noteFile) formData.set("file", noteFile);
    startNoteTransition(async () => {
      const res = await createLeadNote(lead.id, formData);
      if (!res.ok) {
        toast(res.error || "Couldn't add note", "error");
        return;
      }
      setNoteBody("");
      setNoteFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast("Note added.", "success");
      router.refresh();
    });
  };

  // Delete note handler
  const handleDeleteNote = async (id: string) => {
    const ok = await confirm({
      title: "Delete note?",
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startNoteTransition(async () => {
      await deleteLeadNote(id, lead.id);
      toast("Note deleted.", "success");
      router.refresh();
    });
  };

  // Format activities timeline
  const timeline = [
    ...activities.map((a) => {
      const meta = activityMeta[a.activity_type] || { label: a.activity_type, color: "bg-slate-400", icon: Users };
      const label = a.activity_type === "STATUS_CHANGED" ? (statusChangeLabel(a.metadata) ?? meta.label) : meta.label;
      return {
        ...meta,
        label,
        time: relativeTime(a.created_at),
        iso: a.created_at,
        // Locale + timeZone pinned to match formatDate/formatDateTime — an
        // unpinned toLocaleTimeString([], ...) uses the server's locale/zone
        // during SSR and the visitor's during hydration, which mismatches
        // and crashes React with a hydration error (#418).
        timeFormatted: new Date(a.created_at).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', timeZone: "UTC" }),
        metadata: a.metadata,
      };
    }),
    {
      label: "Contact created in LeadPro workspace",
      color: "bg-slate-300",
      icon: Users,
      time: relativeTime(lead.created_at),
      iso: lead.created_at,
      timeFormatted: new Date(lead.created_at).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', timeZone: "UTC" }),
      metadata: null as Record<string, unknown> | null,
    },
  ];

  // Group timeline by date strings
  const groupedTimeline: Record<string, typeof timeline> = {};
  timeline.forEach((item) => {
    const dateObj = new Date(item.iso);
    const dateStr = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    if (!groupedTimeline[dateStr]) {
      groupedTimeline[dateStr] = [];
    }
    groupedTimeline[dateStr].push(item);
  });

  // Sort dates
  const sortedDates = Object.keys(groupedTimeline).sort((a, b) => {
    const timeA = new Date(a).getTime();
    const timeB = new Date(b).getTime();
    return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
  });

  // Dynamic Pipeline index helper
  const getPipelineIndex = (status: string) => {
    switch (status) {
      case "New":
        return 0; // Not Contacted
      case "Contacted":
      case "Nurturing":
        return 1; // Contacted
      case "Qualified":
      case "Converted":
        return 2; // Closed
      case "Lost":
        return 3; // Lost
      default:
        return 0;
    }
  };
  const activePipelineIndex = getPipelineIndex(lead.status);

  // Chevron Stepper shape polygons
  const getClipPath = (index: number, total: number) => {
    if (index === 0) {
      return "polygon(0% 0%, 94% 0%, 100% 50%, 94% 100%, 0% 100%)";
    } else if (index === total - 1) {
      return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 6% 50%)";
    } else {
      return "polygon(0% 0%, 94% 0%, 100% 50%, 94% 100%, 0% 100%, 6% 50%)";
    }
  };

  const steps = [
    { label: "Not Contacted", bg: "bg-indigo-600 dark:bg-indigo-700" },
    { label: "Contacted", bg: "bg-cyan-500 dark:bg-cyan-600" },
    { label: "Closed", bg: "bg-emerald-500 dark:bg-emerald-600" },
    { label: "Lost", bg: "bg-orange-500 dark:bg-orange-600" }
  ];

  return (
    <div className="max-w-[1650px] mx-auto pb-10 text-slate-800 dark:text-slate-700 px-4 sm:px-6">
      {/* Redesigned Breadcrumbs & Export Header */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap flex justify-between items-center">
        <div>
          <h4 className="mb-1 text-xl font-bold">
            Prospects
          </h4>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-0 p-0 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500">
              <li className="breadcrumb-item hover:text-slate-700 dark:hover:text-slate-700">
                <Link href="/">Home</Link>
              </li>
              <span>/</span>
              <li className="breadcrumb-item active text-slate-700 dark:text-slate-700 font-medium" aria-current="page">
                Prospects
              </li>
            </ol>
          </nav>
        </div>

        <div className="gap-2 d-flex align-items-center flex-wrap flex items-center">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="px-3 py-1.5 shadow-sm text-xs font-semibold gap-1.5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md"
            >
              <FileDown className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3 text-slate-400" />
            </Button>
            {exportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50">
                <button
                  onClick={() => {
                    toast("Exporting as PDF...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-[var(--muted)] font-medium flex items-center gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5 text-red-500" /> Export as PDF
                </button>
                <button
                  onClick={() => {
                    toast("Exporting as Excel...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-[var(--muted)] font-medium flex items-center gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5 text-emerald-500" /> Export as Excel
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast("Refreshing details...", "info");
              router.refresh();
            }}
            className="p-2 shadow-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          </Button>

          {onClose ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="px-3 py-1.5 shadow-sm text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md gap-1"
            >
              <X className="h-3.5 w-3.5" /> Close
            </Button>
          ) : (
            <Link href="/leads">
              <Button
                variant="outline"
                size="sm"
                className="px-3 py-1.5 shadow-sm text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Prospects
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Redesigned Contact User Banner Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 mb-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Round avatar wrapper matching Dreamstechnologies layout */}
            <div className="h-16 w-16 rounded-full border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-500 flex items-center justify-center flex-shrink-0 font-bold text-xl shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
                  {displayName}
                </h1>
                <button onClick={handleToggleFavorite} className="focus:outline-none" title="Toggle Favorite">
                  <Star
                    className={cn(
                      "h-4 w-4 transition-colors",
                      lead.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600 hover:text-amber-400"
                    )}
                  />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1 text-xs text-slate-500 dark:text-slate-500">
                {lead.company_name && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {lead.company_name}
                  </span>
                )}
                {(lead.street_address || lead.city || lead.country) && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {[lead.street_address, lead.city, lead.country].filter(Boolean).slice(0, 2).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Status Badges on the right */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <span className="py-1 px-2.5 text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-md font-semibold border border-rose-100 dark:border-rose-900/30 flex items-center gap-1 shadow-sm">
              <Lock className="h-3.5 w-3.5 flex-shrink-0" /> Private
            </span>

            <button
              onClick={openStatusModal}
              disabled={statusLocked}
              title={
                statusDeadEnd
                  ? "This lead is Converted — status can't be changed manually anymore."
                  : campaignLocked
                  ? "This lead is part of a running campaign — status is locked until it finishes or is paused."
                  : undefined
              }
              className={cn(
                "py-1 px-3 text-xs rounded-md font-semibold flex items-center gap-1 shadow-sm transition-colors",
                statusLocked
                  ? "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              )}
            >
              {statusLocked ? <Lock className="h-3.5 w-3.5 flex-shrink-0" /> : <ThumbsUp className="h-3.5 w-3.5 flex-shrink-0" />} {lead.status || "Status"}{" "}
              {!statusLocked && <ChevronDown className="h-3 w-3 text-emerald-100 flex-shrink-0" />}
            </button>

            {/* Quick action triggers */}
            <Button size="sm" onClick={() => setEditOpen(true)} variant="outline" className="text-xs font-semibold gap-1 py-1 px-2.5 h-auto">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            
            {!converted && (
              <>
                <Button size="sm" onClick={() => setConvertOpen(true)} className="text-xs font-bold gap-1 bg-[#18A7B8] hover:bg-[#14929f] text-white py-1 px-2.5 h-auto border-none">
                  <Briefcase className="h-3.5 w-3.5" /> Convert
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConvertOpen(true)}
                  title="Create accounts and contacts from lead record"
                  className="text-xs font-bold gap-1 bg-green-600 hover:bg-green-700 text-white py-1 px-2.5 h-auto border-none"
                >
                  <Building2 className="h-3.5 w-3.5" /> Create Account & Contact
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Redesigned 2-Column Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* LEFT COLUMN: Sidebar (Lead Information & Metadata) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-3 tracking-wide">Lead Information</h6>
            
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 space-y-2">
              <div className="flex justify-between items-center text-xs py-1">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Date Created</p>
                <p className="text-slate-800 dark:text-slate-700 font-semibold">{formatDateTime(lead.created_at)}</p>
              </div>
              <div className="flex justify-between items-center text-xs py-1">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Deal Value</p>
                <p className="text-slate-800 dark:text-slate-700 font-bold text-emerald-600">
                  {opportunities.length > 0
                    ? money(opportunities.reduce((acc, o) => acc + Number(o.deal_value || 0), 0))
                    : "—"}
                </p>
              </div>
              <div className="flex justify-between items-center text-xs py-1">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Due Date</p>
                <p className="text-slate-800 dark:text-slate-700 font-semibold">
                  {meetings.length > 0 ? formatDate(meetings[0].start_at) : "—"}
                </p>
              </div>
              {campaignLocked && (() => {
                const activeCampaign = campaigns.find((c) => c.status === "Active" && c.next_follow_up_at);
                if (!activeCampaign) return null;
                return (
                  <div className="flex justify-between items-center text-xs py-1">
                    <p className="text-slate-500 dark:text-slate-500 font-medium">Follow Up</p>
                    <p className="text-slate-800 dark:text-slate-700 font-semibold text-right">
                      {formatDateTime(activeCampaign.next_follow_up_at!)}
                      <span className="block text-[10px] text-slate-400 font-normal">{activeCampaign.campaign_name}</span>
                    </p>
                  </div>
                );
              })()}
              <div className="flex justify-between items-center text-xs py-1">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Source</p>
                <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.source || "Google"}</p>
              </div>
              <div className="flex justify-between items-center gap-3 text-xs py-1">
                <p className="text-slate-500 dark:text-slate-500 font-medium flex-shrink-0">LinkedIn</p>
                {lead.linkedin ? (
                  <a
                    href={toAbsoluteUrl(lead.linkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={lead.linkedin}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 min-w-0"
                  >
                    <span className="truncate">{lead.linkedin}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                ) : (
                  <p className="text-slate-400 dark:text-slate-600 font-semibold">—</p>
                )}
              </div>
              {lead.website_url && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Website</p>
                  <a href={toAbsoluteUrl(lead.website_url)} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    {lead.website_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {lead.industry && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Industry</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.industry}</p>
                </div>
              )}
              {lead.interest_area && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Interest Area</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.interest_area}</p>
                </div>
              )}
              {lead.job_title && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Job Title</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.job_title}</p>
                </div>
              )}
              {lead.seniority && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Seniority</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.seniority}</p>
                </div>
              )}
              {lead.company_size && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Company Size</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.company_size}</p>
                </div>
              )}
              {lead.twitter_handle && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">Twitter / X Handle</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{lead.twitter_handle}</p>
                </div>
              )}
              {(lead.state || lead.country || lead.postal_code) && (
                <div className="flex justify-between items-center text-xs py-1">
                  <p className="text-slate-500 dark:text-slate-500 font-medium">State / Country / Postal</p>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold text-right">
                    {[lead.state, lead.country, lead.postal_code].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
              {lead.message && (
                <div className="pt-2 text-xs border-t border-slate-100 dark:border-slate-800/80">
                  <p className="text-slate-500 dark:text-slate-500 font-medium mb-1">About</p>
                  <p className="text-slate-800 dark:text-slate-700 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2 rounded-lg whitespace-pre-wrap font-medium">
                    {lead.message}
                  </p>
                </div>
              )}
            </div>

            {/* Owner Section — real owner from leads.owner_id (auto-set to the
                creating user by trg_set_lead_owner), resolved via getLeadHistory(). */}
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-3 tracking-wide">Owner</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold mr-2">
                  {initialsFor(history?.createdByName)}
                </div>
                <div className="text-xs">
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">{history?.createdByName || "Unassigned"}</p>
                </div>
              </div>
            </div>

            {/* Tags Section */}
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Tags</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 flex flex-wrap items-center gap-1.5">
              {(lead.tags || []).map((tag) => (
                <Badge key={tag} variant="success" className="text-[10px] py-0.5 pl-2 pr-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20 rounded font-medium flex items-center gap-1">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-emerald-900 dark:hover:text-emerald-200" aria-label={`Remove ${tag} tag`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <button
                onClick={handleAddTag}
                className="inline-flex items-center gap-0.5 text-[10px] py-0.5 px-2 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              >
                <Plus className="h-2.5 w-2.5" /> Add tag
              </button>
            </div>

            {/* Priority Section */}
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Priority</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <select
                value={lead.priority || "Medium"}
                onChange={(e) => handlePriorityChange(e.target.value as "High" | "Medium" | "Low")}
                className="w-full text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 focus:ring-1 focus:ring-blue-500 font-medium"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Projects Section */}
            <h6 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2 tracking-wide">Projects</h6>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 flex flex-wrap items-center gap-1.5">
              {(lead.projects || []).map((project) => (
                <span key={project} className="text-[10px] py-0.5 pl-2 pr-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-600 border border-slate-200 dark:border-slate-800 rounded font-semibold flex items-center gap-1">
                  {project}
                  <button onClick={() => handleRemoveProject(project)} className="hover:text-slate-900 dark:hover:text-slate-300" aria-label={`Remove ${project} project`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <button
                onClick={handleAddProject}
                className="inline-flex items-center gap-0.5 text-[10px] py-0.5 px-2 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              >
                <Plus className="h-2.5 w-2.5" /> Add project
              </button>
            </div>

            {/* Last Modified Auditing */}
            <div className="space-y-2 text-xs pt-1">
              <div className="flex justify-between items-center">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Last Modified</p>
                <p className="text-slate-800 dark:text-slate-700 font-semibold">
                  {formatDateTime(history?.lastModifiedAt || lead.updated_at)}
                </p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-slate-500 dark:text-slate-500 font-medium">Modified By</p>
                <div className="flex items-center">
                  <div className="h-5 w-5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[9px] font-bold mr-1">
                    {initialsFor(history?.lastModifiedByName)}
                  </div>
                  <p className="text-slate-800 dark:text-slate-700 font-semibold">
                    {history?.lastModifiedByName || "Unassigned"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* AI breakdown widget */}
          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
              <div className="text-xs">
                <h4 className="font-bold text-slate-800 dark:text-slate-700">AI Score Breakdown</h4>
                <p className="text-slate-500 dark:text-slate-500">Score: {lead.lead_score} / 100</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowAiScoreDrawer(true)} variant="outline" className="text-xs font-semibold py-1 px-2.5 h-auto">
              Analyze
            </Button>
          </Card>
        </div>

        {/* RIGHT COLUMN: Interaction Workspace (Stepper & Tabbed Area) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Stepper Pipeline Status */}
          <div className="mb-1">
            <h5 className="text-sm font-bold text-slate-800 dark:text-slate-700 mb-2">Lead Pipeline Status</h5>
            
            <div className="flex flex-wrap gap-y-2 w-full my-3">
              {steps.map((step, idx) => {
                const isActive = activePipelineIndex === idx;
                return (
                  // Read-only status indicator — NOT a control. It used to let
                  // you click "Closed"/"Lost" to force status straight to
                  // "Converted"/"Lost", which faked a conversion with no
                  // Account/Contact/Opportunity ever created. Change status via
                  // the dropdown above instead, which goes through the real
                  // status-flow rules (see status-flow.ts) and the Convert button.
                  <div
                    key={idx}
                    className={cn(
                      "flex-1 min-w-[110px] text-center text-xs font-bold py-2.5 px-4 transition-all duration-200 text-white relative",
                      step.bg,
                      isActive ? "opacity-100 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 scale-[1.01] shadow-md z-10" : "opacity-60"
                    )}
                    style={{
                      clipPath: getClipPath(idx, steps.length),
                    }}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* tab nav headers */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-800 mb-4">
              <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
                {[
                  { id: "activities", label: "Activities", icon: ClockDaysIcon },
                  { id: "notes", label: "Notes & Files", icon: FileTextIcon },
                  { id: "calls", label: "Calls", icon: PhoneIcon },
                  { id: "email", label: "Email", icon: MailIcon }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as "activities" | "notes" | "calls" | "email")}
                      className={cn(
                        "flex items-center gap-1.5 py-3 px-1 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none",
                        isActive
                          ? "border-rose-500 text-rose-600 dark:text-rose-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-700"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* TAB CONTENTS */}
            <div className="tab-content">
              
              {/* TAB 1: ACTIVITIES */}
              {activeTab === "activities" && (
                <div className="space-y-4">
                  <div className="flex align-items-center justify-between flex-wrap row-gap-3 items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Activities</h5>
                    
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                          className="px-2 py-1 shadow-sm text-[11px] font-semibold gap-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md"
                        >
                          <BarChart3 className="h-3 w-3 rotate-90" /> Sort: {sortOrder === "newest" ? "Newest" : "Oldest"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Activity Timeline List */}
                  <div className="space-y-4">
                    {sortedDates.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-6 text-center">No activities recorded.</p>
                    ) : (
                      sortedDates.map((dateStr) => (
                        <div key={dateStr} className="space-y-2.5">
                          <div className="inline-flex items-center gap-1 py-0.5 px-2 bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 text-[10px] font-bold border border-sky-100 dark:border-sky-900/20 rounded">
                            <CalendarDays className="h-3 w-3" /> {dateStr}
                          </div>

                          <div className="space-y-2">
                            {groupedTimeline[dateStr].map((item, index) => {
                              const TimelineIcon = item.icon;
                              const styleMeta = getTimelineStyle(item.label);
                              const emailMeta = item.metadata as { subject?: string; body?: string; to?: string } | null;
                              const hasEmailContent = Boolean(emailMeta?.body || emailMeta?.subject);
                              return (
                                <Card
                                  key={index}
                                  onClick={hasEmailContent ? () => setViewingEmail({ ...emailMeta, sentAt: item.iso }) : undefined}
                                  className={cn(
                                    "p-3 bg-slate-50/50 dark:bg-[var(--muted)] border-slate-100 dark:border-slate-800/80 shadow-none rounded-lg",
                                    hasEmailContent && "cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                                  )}
                                >
                                  <div className="flex items-start">
                                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white mr-3", styleMeta.bg)}>
                                      <TimelineIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h6 className="text-xs font-bold text-slate-800 dark:text-slate-700">
                                        {item.label}
                                      </h6>
                                      <p className="text-[10px] text-slate-400 mt-0.5">{item.timeFormatted || item.time}</p>
                                    </div>
                                    {hasEmailContent && (
                                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">View</span>
                                    )}
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: NOTES */}
              {activeTab === "notes" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                    <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Notes</h5>
                    <button
                      onClick={() => bodyRef.current?.focus()}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> Add New
                    </button>
                  </div>

                  {/* Add note input form */}
                  <div className="space-y-2 bg-slate-50/30 dark:bg-[var(--muted)] p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    <textarea
                      ref={bodyRef}
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Write a note to log against this contact..."
                      rows={2}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          ref={fileRef}
                          type="file"
                          onChange={(e) => setNoteFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="redesign-note-file"
                        />
                        <label
                          htmlFor="redesign-note-file"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-600 cursor-pointer font-semibold flex-shrink-0"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Attach file
                        </label>
                        {noteFile && (
                          <span className="text-[10px] text-slate-500 truncate flex items-center gap-1 max-w-[200px]">
                            · {noteFile.name}
                            <button
                              type="button"
                              onClick={() => { setNoteFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={notePending || !noteBody.trim()}
                        className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                      >
                        {notePending ? "Saving..." : "Add Note"}
                      </Button>
                    </div>
                  </div>

                  {/* Notes List — scrolls on its own once it grows past ~3 notes, so the add-note box above stays put */}
                  <div className="space-y-3 pt-1 max-h-[260px] overflow-y-auto pr-1">
                    {notes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">No notes added yet.</p>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 group shadow-2xs relative">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400 font-medium">
                                <span className="font-bold text-slate-700 dark:text-slate-600">{n.author_name || "Unknown"}</span>
                                <span>·</span>
                                <span>{formatDateTime(n.created_at)}</span>
                              </div>
                              <p className="text-xs text-slate-800 dark:text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                                {n.body}
                              </p>
                              {n.file_url && (
                                <a
                                  href={n.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-2 text-[11px] text-blue-600 hover:underline font-semibold"
                                >
                                  <Paperclip className="h-3 w-3" /> {n.file_name || "Attachment"}
                                </a>
                              )}
                            </div>
                            
                            <button
                              onClick={() => handleDeleteNote(n.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-[var(--muted)] text-slate-300 hover:text-rose-600 flex-shrink-0 transition-opacity"
                              title="Delete note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: CALLS */}
              {activeTab === "calls" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                    <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Meetings & Calls</h5>
                    <button
                      onClick={() => {
                        toast("Opening meeting scheduler...", "info");
                        router.push(`/meetings?leads=${lead.id}`);
                      }}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> Schedule
                    </button>
                  </div>

                  <div className="space-y-3">
                    {meetings.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">No meetings scheduled for this contact.</p>
                    ) : (
                      meetings.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => router.push(`/meetings?open=${m.id}`)}
                          className="w-full text-left p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <h6 className="text-xs font-bold text-slate-800 dark:text-slate-700 truncate">{m.title}</h6>
                              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {formatDateTime(m.start_at)}
                              </p>
                            </div>
                            <Badge variant="blue" className="text-[10px] font-semibold py-0.5 px-2 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/20 rounded">
                              {m.status}
                            </Badge>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: EMAIL */}
              {activeTab === "email" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                    <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Emails & Outreach</h5>
                    <button
                      onClick={() => setEmailOpen(true)}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> Send Email
                    </button>
                  </div>

                  <div className="space-y-3">
                    <Card className="p-6 text-center border-slate-100 dark:border-slate-800/80 shadow-none bg-slate-50/20 dark:bg-[var(--muted)]">
                      <Mail className="h-8 w-8 text-slate-300 mx-auto mb-2.5" />
                      <h6 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-1">Interact with your contact</h6>
                      <p className="text-[11px] text-slate-500 dark:text-slate-500 max-w-sm mx-auto mb-3">
                        Draft and send email campaigns, personalized follow-ups, or request calls directly.
                      </p>
                      <Button
                        onClick={() => setEmailOpen(true)}
                        className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 border-none"
                      >
                        Compose Outreach Email
                      </Button>
                    </Card>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* AI score detail breakdown modal drawer */}
      {showAiScoreDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">AI Prospect Score Breakdown</h3>
              </div>
              <button onClick={() => setShowAiScoreDrawer(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ProspectScoreTab leadId={lead.id} initialResult={lead.ai_score} />
          </div>
        </div>
      )}

      {/* Modals hooks */}
      <SendEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        leadId={lead.id}
        leadEmail={email}
        leadName={displayName}
      />

      <ConvertLeadModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
        onConverted={(result) => {
          setConverted(true);
          setLead((l) => ({
            ...l,
            status: "Converted",
            converted_account_id: result.accountId,
            converted_contact_id: result.contactId,
            converted_opportunity_id: result.opportunityId
          }));
          setConvertOpen(false);
          toast("Lead successfully converted.", "success");
          router.refresh();
        }}
      />

      <EditLeadModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        lead={lead}
      />

      {/* Status change — reason is logged to this lead's activity history, same as before, just a richer form. */}
      <Modal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} size="sm">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initialsFor(displayName)}
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {displayName} <span className="text-slate-300 dark:text-slate-600">·</span> Prospect
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Move this lead&apos;s status</h2>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              Choose the new status and let the team know why — it&apos;s logged to this lead&apos;s activity history.
            </p>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] p-3">
            <span className={cn("px-3 py-1 rounded-full text-xs font-bold flex-shrink-0", statusPillStyle(lead.status))}>
              {lead.status}
            </span>
            <ArrowLeft className="h-3.5 w-3.5 text-slate-300 rotate-180 flex-shrink-0" />
            <select
              value={pendingStatus}
              onChange={(e) => setPendingStatus(e.target.value)}
              className={cn("flex-1 min-w-0 px-3 py-1 rounded-full text-xs font-bold border-none outline-none cursor-pointer", statusPillStyle(pendingStatus))}
            >
              {allowedNextStatuses(lead.status).map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-600 mb-1.5">Reason <span className="text-slate-400 font-normal">(recommended)</span></label>
            <Textarea
              rows={2}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="e.g. Replied to outreach and asked for a demo next week"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["Went cold after demo", "Asked to follow up later", "Budget on hold"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setStatusReason(r)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {lead.owner_id && (
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOwner}
                onChange={(e) => setNotifyOwner(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 flex-shrink-0"
              />
              <span className="text-xs text-amber-900 dark:text-amber-300">
                <span className="font-bold">Notify account owner</span> — send {history?.createdByName || "the owner"} a heads-up that this lead moved to {pendingStatus || "…"}.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setStatusModalOpen(false)} disabled={statusSaving}>Cancel</Button>
            <Button onClick={confirmStatusChange} disabled={statusSaving} className="bg-teal-600 hover:bg-teal-700 text-white font-bold">
              {statusSaving ? "Updating…" : "Update status"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Shows the actual subject/message of a "Sent email" activity when clicked —
          styled to match the compose-email popup (blue To: box, Subject/Message layout)
          since this is that same popup's read-only mirror. */}
      <Modal open={!!viewingEmail} onClose={() => setViewingEmail(null)} size="sm">
        {viewingEmail && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                <Send className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{viewingEmail.subject || "(no subject)"}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(viewingEmail.sentAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}
                </p>
              </div>
              <button onClick={() => setViewingEmail(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[var(--muted)] flex-shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">To:</span>
              <span className="font-semibold truncate">{viewingEmail.to || "—"}</span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Message</label>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] p-3.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-600">
                {viewingEmail.body || "(no message body)"}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Helpers for Lucide icons mapping with tab IDs
function ClockDaysIcon(props: React.ComponentProps<typeof CalendarDays>) {
  return <CalendarDays {...props} />;
}

function FileTextIcon(props: React.ComponentProps<typeof FileDown>) {
  return <FileDown {...props} />;
}

function PhoneIcon(props: React.ComponentProps<typeof Phone>) {
  return <Phone {...props} />;
}

function MailIcon(props: React.ComponentProps<typeof Mail>) {
  return <Mail {...props} />;
}

// Helper to resolve specific styling for timeline items
function getTimelineStyle(label: string) {
  const lbl = label.toLowerCase();
  if (lbl.includes("email") || lbl.includes("message")) {
    return { bg: "bg-sky-500 text-white" };
  } else if (lbl.includes("call") || lbl.includes("phone")) {
    return { bg: "bg-teal-500 text-white" };
  } else if (lbl.includes("note")) {
    return { bg: "bg-rose-500 text-white" };
  } else if (lbl.includes("meeting") || lbl.includes("appointment")) {
    return { bg: "bg-amber-500 text-white" };
  } else {
    return { bg: "bg-slate-400 text-white" };
  }
}
