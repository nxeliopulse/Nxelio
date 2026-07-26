"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Sparkles, LayoutTemplate, Settings2, Loader2, Play, Check, X, Star, Trash2, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aiColumnTemplates, AI_COLUMN_TEMPLATE_CATEGORIES, AI_COLUMN_VARIABLES,
  detectAiColumnActionType,
  type AiColumnTemplate, type AiColumnTemplateCategory, type AiColumnOutputType,
} from "@/lib/leads/ai-column-templates";
import { createAiColumn, previewAiColumn, runAiColumn, deleteAiColumnSavedTemplate, generateAiColumnMeta, type AiColumnSavedTemplateRow } from "@/lib/queries/ai-columns";

type Step = "templates" | "configure";
type ConfigureTab = "generate" | "configure";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  savedTemplates?: AiColumnSavedTemplateRow[];
}

/**
 * Docked sidebar panel — a real sibling column next to the leads table (not a
 * centered modal popup), matching the Clay-style "Use AI" panel that slides in
 * alongside the table instead of covering it.
 */
export function AiColumnModal({ onClose, onCreated, savedTemplates = [] }: Props) {
  const [step, setStep] = useState<Step>("configure");
  const [configureTab, setConfigureTab] = useState<ConfigureTab>("generate");
  const [category, setCategory] = useState<"All" | AiColumnTemplateCategory>("All");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<AiColumnOutputType>("text");
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ leadId: string; label: string; value: string }[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generatingMeta, setGeneratingMeta] = useState(false);

  const detectedAction = useMemo(() => detectAiColumnActionType(prompt), [prompt]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Animate in on the next frame instead of at initial (unmounted) state — the
    // parent only mounts this component while `open` is true, so this always runs
    // exactly once per open.
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setStep("configure");
    setConfigureTab("generate");
    setCategory("All");
    setName("");
    setDescription("");
    setPrompt("");
    setOutputType("text");
    setSourceTemplateId(null);
    setSaveAsTemplate(false);
    setPreview(null);
    setPreviewError(null);
    setSaveError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickTemplate(t: AiColumnTemplate) {
    setName(t.name);
    setDescription(t.description);
    setPrompt(t.promptTemplate);
    setOutputType(t.outputType);
    setSourceTemplateId(t.id);
    setConfigureTab("generate");
    setStep("configure");
  }

  function pickSavedTemplate(t: AiColumnSavedTemplateRow) {
    setName(t.name);
    setDescription(t.description || "");
    setPrompt(t.prompt_template || "");
    setOutputType(t.output_type);
    setSourceTemplateId(null);
    setConfigureTab("generate");
    setStep("configure");
  }

  function startBlank() {
    setName("");
    setDescription("");
    setPrompt("");
    setOutputType("text");
    setSourceTemplateId(null);
    setConfigureTab("generate");
    setStep("configure");
  }

  function goToConfigure() {
    if (!prompt.trim()) return;
    setGeneratingMeta(true);
    startTransition(async () => {
      // Column name/description are AI-generated from the intent text — the user
      // never has to type them themselves, matching how Clay names its columns.
      const meta = await generateAiColumnMeta(prompt);
      setName(meta.name);
      setDescription(meta.description);
      setGeneratingMeta(false);
      setConfigureTab("configure");
    });
  }

  function runPreview() {
    if (!prompt.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewAiColumn({ prompt_template: prompt });
      setPreviewLoading(false);
      if (res.ok) setPreview(res.results ?? []);
      else setPreviewError(res.error || "Preview failed");
    });
  }

  function save(runAfter: boolean) {
    if (!name.trim() || !prompt.trim()) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const col = await createAiColumn({
          name: name.trim(),
          description: description.trim() || undefined,
          prompt_template: prompt.trim(),
          output_type: outputType,
          source_template_id: sourceTemplateId,
          saveAsTemplate,
        });
        if (runAfter) await runAiColumn(col.id);
        onCreated();
        handleClose();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Couldn't save this column");
      }
    });
  }

  function removeSavedTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await deleteAiColumnSavedTemplate(id);
      onCreated(); // reuses the same "refresh data" callback
    });
  }

  const filteredTemplates = category === "All" ? aiColumnTemplates : aiColumnTemplates.filter((t) => t.category === category);

  return (
    <div
      className={`sticky top-0 h-[calc(100vh-1rem)] w-[440px] flex-shrink-0 overflow-y-auto scrollbar-hide rounded-xl border border-slate-200 bg-white shadow-lg transition-transform duration-200 ease-out ${mounted ? "translate-x-0" : "translate-x-8 opacity-0"}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-50 p-1.5"><Sparkles className="h-4 w-4 text-blue-600" /></div>
          <h2 className="font-semibold text-slate-900">
            {step === "templates" ? "Use AI" : configureTab === "generate" ? "Use AI" : "Configure column"}
          </h2>
        </div>
        <button onClick={handleClose} className="p-1 rounded-md hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
      </div>

      {step === "templates" && (
        <div className="p-5 space-y-4">
          <button
            onClick={startBlank}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 p-4 text-left transition-colors"
          >
            <div className="rounded-lg bg-slate-100 p-2"><Settings2 className="h-4 w-4 text-slate-500" /></div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Write your own prompt</p>
              <p className="text-xs text-slate-500">Describe what to generate — mention &quot;AnySite&quot; + &quot;email&quot; to run a real verified-email lookup instead of AI text.</p>
            </div>
          </button>

          {savedTemplates.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">My templates</p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {savedTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => pickSavedTemplate(t)}
                    className="text-left rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm p-3 transition-all relative group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`inline-flex rounded-lg p-1.5 mb-2 ${t.action_type === "anysite_email" ? "bg-cyan-50 text-cyan-600" : "bg-amber-50 text-amber-600"}`}>
                        {t.action_type === "anysite_email" ? <SearchCheck className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      </div>
                      <span
                        role="button"
                        onClick={(e) => removeSavedTemplate(t.id, e)}
                        title="Delete template"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                      </span>
                    </div>
                    <p className="font-medium text-sm text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description || "No description"}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <LayoutTemplate className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Template library</p>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {AI_COLUMN_TEMPLATE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    category === c ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t)}
                  className="text-left rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm p-3 transition-all"
                >
                  <div className={`inline-flex rounded-lg p-1.5 mb-2 ${t.accent}`}><t.icon className="h-4 w-4" /></div>
                  <p className="font-medium text-sm text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "configure" && (
        <div>
          <div className="px-5 pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setConfigureTab("generate")}
                className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                  configureTab === "generate" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Generate
              </button>
              <button
                onClick={() => setConfigureTab("configure")}
                className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                  configureTab === "configure" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Configure
              </button>
            </div>
          </div>

          {configureTab === "generate" && (
            <div className="p-5 space-y-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">What would you like AI to do?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Describe what this column should generate or look up for each lead. Mention &quot;AnySite&quot; + &quot;email&quot; to run a real verified-email lookup instead of AI text.
                </p>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={9}
                placeholder="E.g., Guess the seniority level for {{full_name}} at {{company_name}} — or Find the verified email using anysite"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Insert lead fields with <code className="bg-slate-100 px-1 rounded">{"{{field}}"}</code>
                </p>
                <Button size="sm" onClick={goToConfigure} disabled={!prompt.trim() || generatingMeta}>
                  {generatingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate
                </Button>
              </div>
              <button onClick={() => setStep("templates")} className="text-xs text-slate-500 hover:text-slate-700">← Back to templates</button>
            </div>
          )}

          {configureTab === "configure" && (
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI-named column</p>
                </div>
                <p className="text-sm font-medium text-slate-900 mt-1">{name || "Untitled column"}</p>
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600">Prompt</label>
                  <button onClick={() => setConfigureTab("generate")} className="text-xs text-blue-600 hover:text-blue-800">Edit in Generate</button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-mono"
                />
                {detectedAction === "anysite_email" ? (
                  <p className="text-xs text-cyan-700 bg-cyan-50 rounded-lg px-2.5 py-1.5 mt-1.5 inline-flex items-center gap-1.5">
                    <SearchCheck className="h-3.5 w-3.5" /> Detected: this will run a real AnySite lookup on each lead&apos;s LinkedIn URL — not AI-generated text.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    Fields available: {AI_COLUMN_VARIABLES.map((v) => `{{${v}}}`).join(", ")}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600">Try on 5 rows</p>
                  <Button size="sm" variant="outline" onClick={runPreview} disabled={!prompt.trim() || previewLoading}>
                    {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run preview
                  </Button>
                </div>
                {previewError && <p className="text-xs text-red-600">{previewError}</p>}
                {preview && (
                  <div className="space-y-1.5">
                    {preview.length === 0 && <p className="text-xs text-slate-500">No leads yet to preview against.</p>}
                    {preview.map((r) => (
                      <div key={r.leadId} className="flex items-start justify-between gap-3 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                        <span className="text-slate-500 flex-shrink-0">{r.label}</span>
                        <span className="text-slate-900 text-right">{r.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Also save as a reusable template (shows under &quot;My templates&quot; next time)
              </label>

              {saveError && <p className="text-xs text-red-600">{saveError}</p>}

              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => setConfigureTab("generate")} className="text-xs text-slate-500 hover:text-slate-700 text-left">← Back to Generate</button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => save(false)} disabled={!name.trim() || !prompt.trim() || pending} className="flex-1">
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save column
                  </Button>
                </div>
                <Button size="sm" onClick={() => save(true)} disabled={!name.trim() || !prompt.trim() || pending} className="w-full">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Save & run on all leads
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
