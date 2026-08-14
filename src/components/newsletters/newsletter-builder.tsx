"use client";
import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Save, Send, Sparkles, AlertCircle, CheckCircle2, Loader2, Plus, X,
  Heading, Type, MousePointer2, Minus, Mail, Users, Layers3, Eye, Image as ImageIcon, Upload, Square, LayoutTemplate, Lock,
} from "lucide-react";
import { uploadNewsletterImage } from "@/lib/storage/upload";
import { useFeatureKillSwitch } from "@/lib/hooks/use-feature-kill-switch";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { createNewsletter, updateNewsletter, getNewsletterById, type NewsletterBlock, type NewsletterRow } from "@/lib/queries/newsletters";
import { sendNewsletter, sendTestNewsletter, previewNewsletterHtml } from "@/lib/email/newsletter-actions";
import { generateNewsletter } from "@/lib/ai/actions";
import type { SegmentRow } from "@/lib/queries/segments";
import { newsletterTemplates, type NewsletterTemplateCategory } from "@/lib/newsletter-templates";
import { NewsletterTemplateGallery } from "@/components/newsletters/newsletter-template-gallery";
import { notifyCreditsChanged } from "@/lib/credits-refresh";

const blockIcons: Record<string, React.ReactNode> = {
  heading: <Heading className="h-4 w-4" />,
  paragraph: <Type className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  cta: <MousePointer2 className="h-4 w-4" />,
  divider: <Minus className="h-4 w-4" />,
  banner: <Square className="h-4 w-4" />,
  section: <LayoutTemplate className="h-4 w-4" />,
};

const SECTION_PALETTE = ["#f1f5f9", "#fef3c7", "#ede9fe", "#dbeafe", "#dcfce7", "#fee2e2"];

/** Renders lightweight **bold** / [label](url) markdown as React nodes for the sidebar preview. */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.+?\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-blue-600 underline">{link[1]}</a>;
    return part;
  });
}

interface BlockProps {
  index: number;
  isLocked: boolean;
  onUpload: (idx: number) => void;
  uploadingIdx: number | null;
}

interface EmailStatus {
  provider: "brevo" | "none";
  canReachRecipients: boolean;
  from: string | null;
}

export function NewsletterBuilder({
  segments,
  email,
}: {
  segments: (SegmentRow & { contacts: number })[];
  email: EmailStatus;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const templateParam = params.get("template");
  // Editing an existing newsletter, or arriving with a ?template= deep link, skips the gallery.
  const [templatePicked, setTemplatePicked] = useState(Boolean(id) || Boolean(templateParam));
  const [templateCatFilter, setTemplateCatFilter] = useState<"All" | NewsletterTemplateCategory>("All");
  const [pending, start] = useTransition();
  const [generating, setGenerating] = useState(false);
  const { enabled: sendNewsletterEnabled } = useFeatureKillSwitch("send_newsletter");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [data, setData] = useState<{
    id?: string;
    title: string;
    subject: string;
    preheader: string;
    blocks: NewsletterBlock[];
    audience_type: "all" | "segment";
    segment_id: string | null;
    status: string;
  }>(() => {
    const preset = templateParam ? newsletterTemplates.find((t) => t.id === templateParam) : null;
    return {
      title: preset ? preset.name : "Untitled newsletter",
      subject: preset?.subject || "",
      preheader: "",
      blocks: preset
        ? preset.blocks
        : [
            { type: "heading", text: "Welcome to our newsletter" },
            { type: "paragraph", text: "Hi {{firstName}}, thanks for being a subscriber. Here's what's new this week..." },
          ],
      audience_type: "all",
      segment_id: null,
      status: "Draft",
    };
  });

  // Load existing newsletter if id present
  useEffect(() => {
    if (!id) return;
    getNewsletterById(id).then((row: NewsletterRow | null) => {
      if (!row) return;
      setData({
        id: row.id,
        title: row.title,
        subject: row.subject || "",
        preheader: row.preheader || "",
        blocks: row.content?.blocks || [],
        audience_type: row.audience_type,
        segment_id: row.segment_id,
        status: row.status,
      });
    });
  }, [id]);

  function pickTemplate(templateId: string) {
    const tpl = newsletterTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    setData((d) => ({ ...d, subject: d.subject || tpl.subject, blocks: tpl.blocks }));
    setTemplatePicked(true);
  }
  function startBlank() {
    setTemplatePicked(true);
  }

  function updateBlock(i: number, patch: Partial<NewsletterBlock>) {
    setData({ ...data, blocks: data.blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  }
  function removeBlock(i: number) {
    setData({ ...data, blocks: data.blocks.filter((_, idx) => idx !== i) });
  }
  function addBlock(type: NewsletterBlock["type"]) {
    const defaults: Record<string, NewsletterBlock> = {
      heading: { type: "heading", text: "Section heading" },
      paragraph: { type: "paragraph", text: "Write something here..." },
      image: { type: "image", url: "", alt: "" },
      cta: { type: "cta", text: "Read more", url: "https://example.com", color: "#2563eb" },
      divider: { type: "divider" },
      banner: { type: "banner", text: "Your banner text here", color: "#2563eb", textColor: "#ffffff" },
      section: {
        type: "section",
        color: "#f1f5f9",
        eyebrow: "Section label",
        heading: "Section heading",
        text: "Write the body copy here. Use **bold** for emphasis and [link text](https://example.com) to add a link.",
        imagePosition: "none",
      },
    };
    setData({ ...data, blocks: [...data.blocks, defaults[type]] });
  }

  async function handleImageUpload(idx: number, file: File) {
    setUploadingIdx(idx);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadNewsletterImage(fd);
      if (!result.ok || !result.url) {
        setError(result.error || "Upload failed");
        return;
      }
      updateBlock(idx, { url: result.url });
      setSuccess("Image uploaded");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingIdx(null);
    }
  }
  function moveBlock(i: number, dir: -1 | 1) {
    const next = [...data.blocks];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    setData({ ...data, blocks: next });
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) { setError("Describe the newsletter goal first"); return; }
    setError(null);
    setGenerating(true);
    try {
      const result = await generateNewsletter(aiPrompt.trim());
      setData({
        ...data,
        title: result.title || data.title,
        subject: result.subject || data.subject,
        preheader: result.preheader || data.preheader,
        blocks: result.blocks?.length ? result.blocks : data.blocks,
      });
      setSuccess("Generated by AI — review and edit before sending");
      setTimeout(() => setSuccess(null), 4000);
      notifyCreditsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(redirect = false): Promise<string | null> {
    setError(null);
    return new Promise((resolve) => {
      start(async () => {
        try {
          const payload = {
            title: data.title.trim(),
            subject: data.subject.trim() || null,
            preheader: data.preheader.trim() || null,
            content: { blocks: data.blocks },
            audience_type: data.audience_type,
            segment_id: data.audience_type === "segment" ? data.segment_id : null,
          };
          let savedId = data.id;
          if (data.id) {
            await updateNewsletter(data.id, payload);
          } else {
            const created = await createNewsletter(payload);
            savedId = created.id;
            setData({ ...data, id: savedId });
          }
          if (redirect) {
            router.push("/newsletters");
            return resolve(null);
          }
          setSuccess("Saved");
          setTimeout(() => setSuccess(null), 2000);
          resolve(savedId || null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Save failed");
          resolve(null);
        }
      });
    });
  }

  async function handleSendNow() {
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      // Save first so we have an id
      const savedId = await handleSave(false);
      const targetId = savedId || data.id;
      if (!targetId) { setError("Save failed before send"); return; }
      const result = await sendNewsletter(targetId);
      if (!result.ok) {
        setError(result.error || "Send failed");
      } else {
        const msg = `Bulk email sent successfully — ${result.sent} of ${result.total} recipients${result.failed ? ` (${result.failed} failed)` : ""}${result.redirectedMessage ? ` — ${result.redirectedMessage}` : ""}. ${(result.total ?? 0) * 3} credits used.`;
        setSuccess(msg);
        notifyCreditsChanged();
        setShowSendModal(false);
        setTimeout(() => router.push("/newsletters"), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSendTest() {
    if (!testEmail.includes("@")) { setError("Enter a valid email"); return; }
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const savedId = await handleSave(false);
      const targetId = savedId || data.id;
      if (!targetId) { setError("Save failed before test"); return; }
      const result = await sendTestNewsletter(targetId, testEmail.trim());
      if (!result.ok) {
        setError(result.error || "Test failed");
      } else {
        setSuccess(`Test sent to ${testEmail}${result.redirectedMessage ? ` (${result.redirectedMessage})` : ""}`);
        setShowTestModal(false);
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setSending(false);
    }
  }

  async function openPreview() {
    setShowPreview(true);
    setPreviewLoading(true);
    try {
      const html = await previewNewsletterHtml({ blocks: data.blocks }, { subject: data.subject, preheader: data.preheader });
      setPreviewHtml(html);
    } catch (err) {
      setPreviewHtml(`<p style="padding:24px;font-family:sans-serif;color:#dc2626">${err instanceof Error ? err.message : "Preview failed"}</p>`);
    } finally {
      setPreviewLoading(false);
    }
  }

  const isLocked = data.status === "Sent" || data.status === "Sending";

  if (!templatePicked) {
    return <NewsletterTemplateGallery catFilter={templateCatFilter} onCatFilterChange={setTemplateCatFilter} onPick={pickTemplate} onBlank={startBlank} backHref="/newsletters" />;
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/newsletters" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to newsletters
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={data.title}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              className="text-2xl font-bold border border-transparent !h-auto px-2 bg-transparent text-slate-900 dark:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/40 hover:border-slate-200 dark:hover:border-slate-800/80 focus:bg-slate-100/50 dark:focus:bg-slate-800/40 focus:border-[var(--primary)] transition-all min-w-[280px] max-w-md"
              disabled={isLocked}
            />
            <Badge variant={isLocked ? "success" : "default"}>{data.status}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={openPreview} disabled={pending || sending}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowTestModal(true)}
            disabled={!sendNewsletterEnabled || pending || sending || isLocked}
            title={!sendNewsletterEnabled ? "Sending newsletters has been temporarily disabled by the administrator." : undefined}
          >
            {sendNewsletterEnabled ? <Mail className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send test
          </Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={pending || sending || isLocked}>
            <Save className="h-4 w-4" /> {pending ? "Saving..." : "Save"}
          </Button>
          <Button
            onClick={() => setShowSendModal(true)}
            disabled={!sendNewsletterEnabled || pending || sending || isLocked}
            title={!sendNewsletterEnabled ? "Sending newsletters has been temporarily disabled by the administrator." : undefined}
          >
            {sendNewsletterEnabled ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send to subscribers
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Editor */}
        <div className="space-y-4">
          {/* AI generator */}
          <Card className="p-5 bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-50 border-indigo-100 dark:from-indigo-950/20 dark:via-[#1b212e] dark:to-indigo-950/20 dark:border-indigo-950/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">AI Newsletter Generator</h3>
              <Badge variant="purple">Groq</Badge>
            </div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="What's this newsletter about? e.g. 'Monthly product roundup with our 3 newest AI features and a customer success story.'"
              rows={2}
              className="bg-white border-slate-200"
              disabled={isLocked || generating}
            />
            <div className="flex items-center justify-end mt-3">
              <Button onClick={handleAiGenerate} disabled={generating || isLocked}>
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing...</> : <><Sparkles className="h-4 w-4" /> Generate content</>}
              </Button>
            </div>
          </Card>

          {/* Subject + preheader */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject line *</label>
                <Input
                  value={data.subject}
                  onChange={(e) => setData({ ...data, subject: e.target.value })}
                  placeholder="What recipients will see in their inbox"
                  disabled={isLocked}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Preheader (preview text)</label>
                <Input
                  value={data.preheader}
                  onChange={(e) => setData({ ...data, preheader: e.target.value })}
                  placeholder="Optional preview shown after the subject"
                  disabled={isLocked}
                />
              </div>
            </div>
          </Card>

          {/* Content blocks */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-slate-400" /> Content blocks
              </h3>
              <span className="text-xs text-slate-500">{data.blocks.length} block{data.blocks.length === 1 ? "" : "s"}</span>
            </div>

            <div className="space-y-2">
              {data.blocks.map((block, i) => (
                <div key={i} className="group relative border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="text-slate-400 flex-shrink-0 mt-1">{blockIcons[block.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs uppercase text-slate-400 font-semibold mb-1">{block.type}</p>
                      {block.type === "heading" && (
                        <Input value={block.text || ""} onChange={(e) => updateBlock(i, { text: e.target.value })} disabled={isLocked} />
                      )}
                      {block.type === "paragraph" && (
                        <Textarea value={block.text || ""} onChange={(e) => updateBlock(i, { text: e.target.value })} rows={3} disabled={isLocked} />
                      )}
                      {block.type === "image" && (
                        <div className="space-y-2">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                            ref={(el) => { fileInputRefs.current[i] = el; }}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(i, f);
                              e.target.value = "";
                            }}
                          />
                          {block.url ? (
                            <div className="relative rounded-lg overflow-hidden border border-slate-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={block.url} alt={block.alt || ""} className="w-full max-h-64 object-cover" />
                              <button
                                type="button"
                                onClick={() => updateBlock(i, { url: "" })}
                                disabled={isLocked}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-white/90 hover:bg-white text-slate-700 shadow"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                              <Input
                                value={block.url || ""}
                                placeholder="Paste image URL or click Upload"
                                onChange={(e) => updateBlock(i, { url: e.target.value })}
                                disabled={isLocked || uploadingIdx === i}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRefs.current[i]?.click()}
                                disabled={isLocked || uploadingIdx === i}
                              >
                                {uploadingIdx === i ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}
                              </Button>
                            </div>
                          )}
                          <Input
                            value={block.alt || ""}
                            placeholder="Alt text (describe the image for accessibility)"
                            onChange={(e) => updateBlock(i, { alt: e.target.value })}
                            disabled={isLocked}
                            className="text-xs"
                          />
                        </div>
                      )}
                      {block.type === "cta" && (
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                          <Input value={block.text || ""} placeholder="Button text" onChange={(e) => updateBlock(i, { text: e.target.value })} disabled={isLocked} />
                          <Input value={block.url || ""} placeholder="https://..." onChange={(e) => updateBlock(i, { url: e.target.value })} disabled={isLocked} />
                          <input
                            type="color"
                            value={block.color || "#2563eb"}
                            onChange={(e) => updateBlock(i, { color: e.target.value })}
                            disabled={isLocked}
                            title="Button color"
                            className="h-9 w-9 rounded-md border border-slate-200 cursor-pointer"
                          />
                        </div>
                      )}
                      {block.type === "banner" && (
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                          <Input value={block.text || ""} placeholder="Banner text" onChange={(e) => updateBlock(i, { text: e.target.value })} disabled={isLocked} />
                          <input
                            type="color"
                            value={block.color || "#2563eb"}
                            onChange={(e) => updateBlock(i, { color: e.target.value })}
                            disabled={isLocked}
                            title="Background color"
                            className="h-9 w-9 rounded-md border border-slate-200 cursor-pointer"
                          />
                          <input
                            type="color"
                            value={block.textColor || "#ffffff"}
                            onChange={(e) => updateBlock(i, { textColor: e.target.value })}
                            disabled={isLocked}
                            title="Text color"
                            className="h-9 w-9 rounded-md border border-slate-200 cursor-pointer"
                          />
                        </div>
                      )}
                      {block.type === "section" && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <Input value={block.eyebrow || ""} placeholder="Eyebrow label (optional)" onChange={(e) => updateBlock(i, { eyebrow: e.target.value })} disabled={isLocked} className="flex-1" />
                            <div className="flex items-center gap-1">
                              {SECTION_PALETTE.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => updateBlock(i, { color: c })}
                                  disabled={isLocked}
                                  title={c}
                                  className={`h-6 w-6 rounded-full border-2 ${block.color === c ? "border-slate-900" : "border-transparent"}`}
                                  style={{ background: c }}
                                />
                              ))}
                              <input
                                type="color"
                                value={block.color || "#f1f5f9"}
                                onChange={(e) => updateBlock(i, { color: e.target.value })}
                                disabled={isLocked}
                                title="Custom background color"
                                className="h-6 w-6 rounded-md border border-slate-200 cursor-pointer"
                              />
                              <button
                                type="button"
                                onClick={() => updateBlock(i, { textColor: block.textColor ? undefined : "#ffffff" })}
                                disabled={isLocked}
                                title="Toggle white text (for dark backgrounds)"
                                className={`h-6 px-2 rounded-md border text-[10px] font-semibold ${block.textColor ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500"}`}
                              >
                                Aa
                              </button>
                            </div>
                          </div>
                          <Input value={block.heading || ""} placeholder="Heading" onChange={(e) => updateBlock(i, { heading: e.target.value })} disabled={isLocked} />
                          <Textarea
                            value={block.text || ""}
                            placeholder="Body copy — use **bold** and [link text](https://...) for links"
                            onChange={(e) => updateBlock(i, { text: e.target.value })}
                            rows={3}
                            disabled={isLocked}
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                              ref={(el) => { fileInputRefs.current[i] = el; }}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleImageUpload(i, f);
                                e.target.value = "";
                              }}
                            />
                            <Input
                              value={block.url || ""}
                              placeholder="Image URL (optional)"
                              onChange={(e) => updateBlock(i, { url: e.target.value })}
                              disabled={isLocked || uploadingIdx === i}
                              className="flex-1"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRefs.current[i]?.click()} disabled={isLocked || uploadingIdx === i}>
                              {uploadingIdx === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            </Button>
                            <Select value={block.imagePosition || "none"} onChange={(e) => updateBlock(i, { imagePosition: e.target.value as NewsletterBlock["imagePosition"] })} disabled={isLocked} className="w-32">
                              <option value="none">No image</option>
                              <option value="top">Image top</option>
                              <option value="left">Image left</option>
                              <option value="right">Image right</option>
                            </Select>
                          </div>
                          <Input value={block.quote || ""} placeholder="Pull quote (optional)" onChange={(e) => updateBlock(i, { quote: e.target.value })} disabled={isLocked} />
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                            <Input value={block.ctaText || ""} placeholder="Button text (optional)" onChange={(e) => updateBlock(i, { ctaText: e.target.value })} disabled={isLocked} />
                            <Input value={block.ctaUrl || ""} placeholder="https://..." onChange={(e) => updateBlock(i, { ctaUrl: e.target.value })} disabled={isLocked} />
                            <input
                              type="color"
                              value={block.ctaColor || "#e11d48"}
                              onChange={(e) => updateBlock(i, { ctaColor: e.target.value })}
                              disabled={isLocked}
                              title="Button color"
                              className="h-9 w-9 rounded-md border border-slate-200 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                      {block.type === "divider" && <p className="text-xs text-slate-500">Horizontal line separator</p>}
                    </div>
                    {!isLocked && (
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveBlock(i, -1)} className="p-1 rounded hover:bg-slate-100 text-slate-400" title="Move up">↑</button>
                        <button onClick={() => moveBlock(i, 1)} className="p-1 rounded hover:bg-slate-100 text-slate-400" title="Move down">↓</button>
                        <button onClick={() => removeBlock(i)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Remove">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {data.blocks.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No blocks yet. Click a button below to add one, or use AI to generate the whole newsletter.</p>
              )}
            </div>

            {!isLocked && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                <p className="text-xs font-semibold text-slate-500 self-center mr-2">Add block:</p>
                {[
                  { type: "section" as const, label: "Color section" },
                  { type: "heading" as const, label: "Heading" },
                  { type: "paragraph" as const, label: "Paragraph" },
                  { type: "banner" as const, label: "Color banner" },
                  { type: "image" as const, label: "Image" },
                  { type: "cta" as const, label: "CTA button" },
                  { type: "divider" as const, label: "Divider" },
                ].map((b) => (
                  <Button key={b.type} variant="outline" size="sm" onClick={() => addBlock(b.type)}>
                    <Plus className="h-3.5 w-3.5" /> {b.label}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right panel: audience + preview */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" /> Audience
            </h3>
            <div className="space-y-3 text-sm">
              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${data.audience_type === "all" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200"}`}>
                <input
                  type="radio"
                  checked={data.audience_type === "all"}
                  onChange={() => setData({ ...data, audience_type: "all", segment_id: null })}
                  disabled={isLocked}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-slate-900">All subscribers</p>
                  <p className="text-xs text-slate-500 mt-0.5">Every lead with is_subscribed = true</p>
                </div>
              </label>

              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${data.audience_type === "segment" ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200"}`}>
                <input
                  type="radio"
                  checked={data.audience_type === "segment"}
                  onChange={() => setData({ ...data, audience_type: "segment" })}
                  disabled={isLocked}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium text-slate-900">Specific segment</p>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Members of one of your segments</p>
                  {data.audience_type === "segment" && (
                    <Select
                      value={data.segment_id || ""}
                      onChange={(e) => setData({ ...data, segment_id: e.target.value || null })}
                      disabled={isLocked}
                    >
                      <option value="">Choose a segment...</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>{s.segment_name} ({s.contacts})</option>
                      ))}
                    </Select>
                  )}
                </div>
              </label>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-400" /> Preview
            </h3>
            <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 text-sm">
                <p className="font-bold text-slate-900 mb-1">{data.subject || "(no subject)"}</p>
                {data.preheader && <p className="text-xs text-slate-500 mb-3">{data.preheader}</p>}
                <hr className="border-slate-100 mb-3" />
                {data.blocks.length === 0 ? (
                  <p className="text-xs text-slate-400">(empty)</p>
                ) : (
                  <div className="space-y-2">
                    {data.blocks.map((b, i) => {
                      if (b.type === "heading") return <h2 key={i} className="text-lg font-bold text-slate-900">{b.text}</h2>;
                      if (b.type === "paragraph") return <p key={i} className="text-sm text-slate-700 leading-relaxed">{renderRich(b.text || "")}</p>;
                      if (b.type === "image" && b.url) {
                        // eslint-disable-next-line @next/next/no-img-element
                        return <img key={i} src={b.url} alt={b.alt || ""} className="w-full rounded-md my-1" />;
                      }
                      if (b.type === "cta") return <div key={i} className="text-center my-2"><span className="inline-block px-4 py-2 text-white rounded-md text-sm font-medium" style={{ background: b.color || "#2563eb" }}>{b.text}</span></div>;
                      if (b.type === "banner") return <div key={i} className="rounded-md px-3 py-2.5 font-bold text-sm" style={{ background: b.color || "#2563eb", color: b.textColor || "#ffffff" }}>{b.text}</div>;
                      if (b.type === "section") {
                        const imgEl = b.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.url} alt={b.alt || ""} className={b.imagePosition === "left" || b.imagePosition === "right" ? "w-20 h-20 object-cover rounded-md flex-shrink-0" : "w-full rounded-md mb-2"} />
                        ) : null;
                        const fg = b.textColor || "#0f172a";
                        const textCol = (
                          <div className="flex-1 min-w-0">
                            {b.eyebrow && <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: fg, opacity: 0.75 }}>{b.eyebrow}</p>}
                            {b.heading && <p className="font-bold text-sm mb-1" style={{ color: fg }}>{b.heading}</p>}
                            {b.text && <p className="text-xs leading-relaxed" style={{ color: b.textColor || "#334155" }}>{renderRich(b.text)}</p>}
                            {b.quote && <div className="mt-2 pl-2 text-xs italic" style={{ borderLeft: `2px solid ${fg}`, color: fg }}>{b.quote}</div>}
                            {b.ctaText && (
                              <span className="inline-block mt-2 px-3 py-1 rounded-full text-white text-xs font-semibold" style={{ background: b.ctaColor || "#e11d48" }}>
                                {b.ctaText}
                              </span>
                            )}
                          </div>
                        );
                        return (
                          <div key={i} className="rounded-lg p-3" style={{ background: b.color || "#f1f5f9" }}>
                            {b.imagePosition === "left" || b.imagePosition === "right" ? (
                              <div className="flex gap-3" style={{ flexDirection: b.imagePosition === "right" ? "row-reverse" : "row" }}>
                                {imgEl}
                                {textCol}
                              </div>
                            ) : (
                              <>
                                {b.imagePosition === "top" && imgEl}
                                {textCol}
                              </>
                            )}
                          </div>
                        );
                      }
                      if (b.type === "divider") return <hr key={i} className="border-slate-100" />;
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">Variables like {`{{firstName}}`} replaced when sending.</p>
          </Card>
        </div>
      </div>

      {/* Send confirm modal */}
      <Modal open={showSendModal} onClose={() => setShowSendModal(false)} title="Send newsletter" description="Confirm before delivering">
        <div className="p-5 space-y-3 text-sm">
          <p className="text-slate-700">
            Send <strong>{data.title}</strong> to{" "}
            <strong>
              {data.audience_type === "all" ? "all subscribed leads" : "the selected segment"}
            </strong>?
          </p>
          {email.canReachRecipients ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              ✅ Sends via Brevo{email.from ? ` from ${email.from}` : ""} to every recipient.
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠️ No email provider is configured — newsletters are simulated (logged, not delivered). Set BREVO_API_KEY + BREVO_FROM_EMAIL to send for real.
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowSendModal(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSendNow} disabled={sending}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send now</>}
          </Button>
        </div>
      </Modal>

      {/* Test send modal */}
      <Modal open={showTestModal} onClose={() => setShowTestModal(false)} title="Send test" description="Preview the email in a real inbox">
        <div className="p-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700">Recipient email</label>
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <p className="text-xs text-slate-500">
            {email.canReachRecipients
              ? "Sends via Brevo to any address."
              : "No email provider configured — the test is simulated (logged, not sent)."}
          </p>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowTestModal(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSendTest} disabled={sending || !testEmail.includes("@")}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send test</>}
          </Button>
        </div>
      </Modal>

      {/* Full-screen preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
          <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Preview</p>
              <p className="text-xs text-slate-500">{data.subject || "(no subject)"}</p>
            </div>
            <button onClick={() => setShowPreview(false)} className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full text-slate-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Rendering preview...
              </div>
            ) : (
              <iframe title="Newsletter preview" srcDoc={previewHtml} sandbox="" className="block w-full h-full border-0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
