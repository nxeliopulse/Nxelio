"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, Forward, Star, Send, Paperclip, MoreHorizontal, Tag, X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { markRead, markUnread, sendReply, getInboxThread, deleteInboxConversation, type InboxConversation, type InboxMessage } from "@/lib/queries/inbox";
import { addBlocklistEntry } from "@/lib/queries/blocklist";
import { getEmailTemplates, type EmailTemplateRow } from "@/lib/queries/templates";

const TAG_OPTIONS = ["Hot", "Needs Reply", "Follow Up", "Spam"] as const;

/**
 * Turns a raw email body (HTML, tracking pixels, quoted history) into clean,
 * readable text showing just the new message.
 */
function cleanEmailText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<\/(p|div|br|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");                 // strip remaining tags
  // decode the common entities
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
       .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  // cut the quoted reply history ("On <date> … wrote:" and everything after)
  s = s.split(/\n?On .{0,80}wrote:/)[0];
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InboxView({ conversations }: { conversations: InboxConversation[] }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const visible = conversations;
  const [active, setActive] = useState<InboxConversation | null>(visible[0] || null);
  const [thread, setThread] = useState<InboxMessage[]>([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "replied">("all");
  const [search, setSearch] = useState("");

  // Icon state
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [tagsByConv, setTagsByConv] = useState<Map<string, string[]>>(new Map());
  const [tagOpen, setTagOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const morePopoverRef = useRef<HTMLDivElement>(null);
  const templatesPopoverRef = useRef<HTMLDivElement>(null);

  // Load templates on mount
  useEffect(() => {
    getEmailTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Load the full conversation thread (inbound + your sent replies) for the open lead.
  function loadThread(leadId: string | null | undefined) {
    if (!leadId) return;
    getInboxThread(leadId).then(setThread).catch(() => setThread([]));
  }
  useEffect(() => {
    const leadId = active?.lead_id;
    if (!leadId) return;
    let cancelled = false;
    getInboxThread(leadId).then((t) => { if (!cancelled) setThread(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [active?.lead_id]);

  // Jump to the newest message whenever the thread or active conversation changes.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread, active?.id]);

  // Close popovers on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (tagOpen && tagPopoverRef.current && !tagPopoverRef.current.contains(target)) setTagOpen(false);
      if (moreOpen && morePopoverRef.current && !morePopoverRef.current.contains(target)) setMoreOpen(false);
      if (templatesOpen && templatesPopoverRef.current && !templatesPopoverRef.current.contains(target)) setTemplatesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [tagOpen, moreOpen, templatesOpen]);

  const filtered = visible
    .filter((c) => filter === "all" || (filter === "unread" && !c.is_read) || (filter === "replied" && c.is_read))
    .filter((c) => !search || (c.lead_name?.toLowerCase().includes(search.toLowerCase()) ?? false));

  function handleSelect(c: InboxConversation) {
    setActive(c);
    if (!c.is_read) start(async () => { await markRead(c.id); });
  }

  function handleSend() {
    if (!active?.lead_id || !reply.trim()) return;
    start(async () => {
      const res = await sendReply(active.lead_id!, `Re: ${active.subject || ""}`, reply.trim());
      if (!res.ok) {
        toast(res.error || "Reply failed to send", "error");
        return;
      }
      setReply("");
      setAttachment(null);
      toast("Reply sent", "success");
      loadThread(active.lead_id);   // show the sent message in the thread immediately
    });
  }

  function toggleStar() {
    if (!active) return;
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(active.id)) next.delete(active.id);
      else next.add(active.id);
      return next;
    });
  }

  function addTag(tag: string) {
    if (!active) return;
    setTagsByConv((prev) => {
      const next = new Map(prev);
      const current = next.get(active.id) || [];
      if (!current.includes(tag)) next.set(active.id, [...current, tag]);
      return next;
    });
    setTagOpen(false);
  }

  function removeTag(tag: string) {
    if (!active) return;
    setTagsByConv((prev) => {
      const next = new Map(prev);
      const current = next.get(active.id) || [];
      next.set(active.id, current.filter((t) => t !== tag));
      return next;
    });
  }

  async function handleDeleteConversation() {
    if (!active?.lead_id) return;
    const ok = await confirm({
      title: "Delete conversation?",
      message: `Permanently delete all messages with ${active.lead_name}? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const leadId = active.lead_id;
    setActive(visible.filter((c) => c.lead_id !== leadId)[0] || null);
    setThread([]);
    start(async () => {
      await deleteInboxConversation(leadId);
      toast("Conversation deleted", "success");
      router.refresh();
    });
  }

  function handleMarkUnread() {
    if (!active) return;
    const id = active.id;
    setMoreOpen(false);
    start(async () => {
      await markUnread(id);
      router.refresh();
    });
  }

  function handleBlockSender() {
    if (!active) return;
    const email = active.lead_email;
    setMoreOpen(false);
    if (!email) {
      toast("No sender email available to block", "error");
      return;
    }
    start(async () => {
      await addBlocklistEntry(email, "Blocked from inbox");
      toast(`Blocked ${email}`, "success");
    });
  }

  function handleOpenLeadProfile() {
    if (!active?.lead_id) return;
    setMoreOpen(false);
    router.push(`/leads/${active.lead_id}`);
  }

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
    e.target.value = "";
  }

  function handlePickTemplate(t: EmailTemplateRow) {
    setReply(t.body || "");
    setTemplatesOpen(false);
  }

  function handleForwardSubmit() {
    setForwardOpen(false);
    setForwardTo("");
    toast("Forwarded", "success");
  }

  const activeTags = active ? (tagsByConv.get(active.id) || []) : [];
  const isStarred = active ? starred.has(active.id) : false;

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader title="Smart Inbox" description="Unified inbox for all campaign replies" />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] h-[calc(100vh-220px)]">
          {/* Conversation list */}
          <div className="border-r border-slate-100 flex flex-col">
            <div className="p-3 border-b border-slate-100 space-y-2">
              <Input
                leftIcon={<Search className="h-4 w-4" />}
                placeholder="Search messages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex items-center gap-1">
                {(["all", "unread", "replied"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                      filter === f ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <button className="ml-auto p-1.5 rounded-md hover:bg-slate-100"><Filter className="h-3.5 w-3.5 text-slate-500" /></button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">No messages</p>
            ) : (
              <ul className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {filtered.map((c) => (
                  <li
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    className={`p-3 cursor-pointer transition-colors ${active?.id === c.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {(c.lead_name || "??").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className={`text-sm truncate ${!c.is_read ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                            {c.lead_name}
                          </p>
                          <span className="text-xs text-slate-400 flex-shrink-0">{relativeTime(c.created_at)}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-1 truncate">{c.lead_company || "—"}</p>
                        <p className={`text-xs line-clamp-2 ${!c.is_read ? "text-slate-700" : "text-slate-500"}`}>{cleanEmailText(c.body)}</p>
                        <div className="mt-1.5 flex items-center gap-1">
                          {c.campaign_name && <Badge variant="blue">{c.campaign_name}</Badge>}
                          {starred.has(c.id) && <Star className="h-3 w-3 text-yellow-500" fill="currentColor" />}
                          {!c.is_read && <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Conversation view */}
          {active ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
                    {(active.lead_name || "??").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{active.lead_name}</p>
                    <p className="text-xs text-slate-500">{active.lead_company || "—"} · {active.campaign_name || "Direct"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={toggleStar} aria-label="Star">
                    <Star
                      className={`h-4 w-4 ${isStarred ? "text-yellow-500" : ""}`}
                      fill={isStarred ? "currentColor" : "none"}
                    />
                  </Button>

                  <div className="relative" ref={tagPopoverRef}>
                    <Button variant="ghost" size="icon" onClick={() => setTagOpen((v) => !v)} aria-label="Tag">
                      <Tag className="h-4 w-4" />
                    </Button>
                    {tagOpen && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-slate-200 rounded-lg shadow-lg p-2">
                        <p className="text-xs font-medium text-slate-500 px-2 py-1">Add a tag</p>
                        <div className="flex flex-wrap gap-1 px-1 py-1">
                          {TAG_OPTIONS.map((t) => (
                            <button
                              key={t}
                              onClick={() => addTag(t)}
                              className="px-2 py-1 text-xs rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-700"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button variant="ghost" size="icon" onClick={handleDeleteConversation} aria-label="Delete conversation" className="hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="relative" ref={morePopoverRef}>
                    <Button variant="ghost" size="icon" onClick={() => setMoreOpen((v) => !v)} aria-label="More">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    {moreOpen && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                        <button
                          onClick={handleMarkUnread}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                        >
                          Mark as unread
                        </button>
                        <button
                          onClick={handleBlockSender}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                        >
                          Block sender
                        </button>
                        <button
                          onClick={handleOpenLeadProfile}
                          disabled={!active.lead_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Open lead profile
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 bg-slate-50">
                {activeTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeTags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1">
                        <Badge variant="blue">{t}</Badge>
                        <button
                          onClick={() => removeTag(t)}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                          aria-label={`Remove ${t}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {(thread.length ? thread : [active]).map((m) => {
                    const outbound = m.direction === "outbound";
                    return (
                      <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm border ${outbound ? "bg-blue-50 border-blue-100 rounded-tr-sm" : "bg-white border-slate-100 rounded-tl-sm"}`}>
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{cleanEmailText(m.body)}</p>
                          <p className="text-xs text-slate-400 mt-1.5">{outbound ? "You" : active.lead_name} · {relativeTime(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-slate-100 p-4">
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="w-full resize-none outline-none text-sm placeholder:text-slate-400"
                  />
                  {attachment && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md text-xs text-slate-700">
                        <Paperclip className="h-3 w-3" />
                        {attachment.name}
                        <button
                          onClick={() => setAttachment(null)}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={handlePickFile} aria-label="Attach file">
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <div className="relative" ref={templatesPopoverRef}>
                        <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen((v) => !v)}>
                          Templates
                        </Button>
                        {templatesOpen && (
                          <div className="absolute left-0 bottom-full mb-1 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
                            {templates.length === 0 ? (
                              <p className="text-xs text-slate-500 px-3 py-2">No templates available</p>
                            ) : (
                              templates.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => handlePickTemplate(t)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                                >
                                  <div className="font-medium truncate">{t.template_name}</div>
                                  {t.subject && (
                                    <div className="text-xs text-slate-500 truncate">{t.subject}</div>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setForwardOpen(true)}>
                        <Forward className="h-3.5 w-3.5" /> Forward
                      </Button>
                      <Button size="sm" onClick={handleSend} disabled={!reply.trim() || pending}>
                        <Send className="h-3.5 w-3.5" /> {pending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center text-slate-400">
              Select a conversation
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={forwardOpen}
        onClose={() => setForwardOpen(false)}
        title="Forward message"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Forward to (email)</label>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={forwardTo}
              onChange={(e) => setForwardTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <Input
              type="text"
              value={`Fwd: ${active?.subject || ""}`}
              readOnly
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setForwardOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleForwardSubmit} disabled={!forwardTo.trim()}>
              <Forward className="h-3.5 w-3.5" /> Forward
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
