"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Share2, Mail, Layers, ArrowRight, Star, Clock, BarChart2, Zap, CheckCircle2, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PLAYBOOK_TEMPLATES, PLAYBOOK_CHANNELS,
  type PlaybookTemplate, type PlaybookChannel,
} from "@/lib/playbooks";

interface Props {
  goals?: string[];
}

const CHANNEL_ICON: Record<string, React.ElementType> = {
  LinkedIn: Share2,
  Email: Mail,
  "Multi-channel": Layers,
  "Follow-up": ArrowRight,
  "Cold outreach": Zap,
};

const CHANNEL_COLOR: Record<string, string> = {
  LinkedIn:       "bg-sky-50 text-sky-700 border-sky-200",
  Email:          "bg-blue-50 text-blue-700 border-blue-200",
  "Multi-channel":"bg-indigo-50 text-indigo-700 border-indigo-200",
  "Follow-up":    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Cold outreach":"bg-amber-50 text-amber-700 border-amber-200",
};

export function PlaybooksView({ goals = [] }: Props) {
  const router = useRouter();
  const [activeChannel, setActiveChannel] = useState<PlaybookChannel | "All">("All");
  const [preview, setPreview] = useState<PlaybookTemplate | null>(null);
  const [activated, setActivated] = useState<Set<string>>(new Set());

  const filtered = PLAYBOOK_TEMPLATES.filter(
    (p) => activeChannel === "All" || p.channel === activeChannel || p.tags.includes(activeChannel)
  );

  function isRecommended(p: PlaybookTemplate) {
    return goals.some((g) => p.recommendedFor.includes(g));
  }

  function activate(key: string) {
    setActivated((prev) => new Set([...prev, key]));
    setPreview(null);
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Playbooks</h1>
        <p className="text-sm text-slate-500 mt-0.5">Ready-to-run outreach sequences for every scenario</p>
      </div>

      {/* Channel filters */}
      <div className="flex flex-wrap gap-2">
        {PLAYBOOK_CHANNELS.map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all",
              activeChannel === ch
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
            )}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const ChIcon = CHANNEL_ICON[p.channel] ?? Zap;
          const rec = isRecommended(p);
          const done = activated.has(p.key);
          return (
            <Card
              key={p.key}
              className={cn("flex flex-col relative", rec && "ring-2 ring-blue-500 ring-offset-1")}
            >
              {rec && (
                <div className="absolute -top-3 left-4 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold shadow">
                  <Star className="h-3 w-3 fill-white" /> Recommended
                </div>
              )}
              <CardContent className="pt-5 flex flex-col flex-1 gap-4">
                {/* Channel badge */}
                <div className="flex items-center justify-between">
                  <span className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", CHANNEL_COLOR[p.channel] ?? "bg-slate-50 text-slate-600 border-slate-200")}>
                    <ChIcon className="h-3 w-3" />
                    {p.channel}
                  </span>
                  {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </div>

                {/* Title + desc */}
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{p.title}</h3>
                  <p className="text-sm text-slate-500 leading-snug">{p.description}</p>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { Icon: Layers,    label: "Steps",      value: p.steps },
                    { Icon: Clock,     label: "Days",       value: p.days },
                    { Icon: BarChart2, label: "Reply rate", value: p.replyRate },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} className="flex flex-col items-center p-2 rounded-xl bg-slate-50">
                      <Icon className="h-3.5 w-3.5 text-slate-400 mb-1" />
                      <span className="text-sm font-bold text-slate-900">{value}</span>
                      <span className="text-[10px] text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreview(p)}
                    className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => activate(p.key)}
                    disabled={done}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-medium transition-colors",
                      done
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    )}
                  >
                    {done ? "Active" : "Use playbook"}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview modal */}
      {preview && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{preview.title}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{preview.description}</p>
                </div>
                <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-4">
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              <div className="space-y-2">
                {Array.from({ length: preview.steps }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-sm text-slate-700">
                      {stepLabel(preview.channel, i)}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">Day {stepDay(i)}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setPreview(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => activate(preview.key)}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Use this playbook
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function stepLabel(channel: string, idx: number): string {
  const emailSteps = [
    "Send initial outreach email",
    "Follow-up: value-add content",
    "Follow-up: case study or proof",
    "Break-up email",
    "Final check-in",
    "Re-engagement attempt",
  ];
  const linkedinSteps = [
    "Send connection request with note",
    "Message after connection accepted",
    "Share relevant content",
    "Follow-up with value prop",
    "Invite to call / demo",
    "Final outreach message",
  ];
  const steps = channel === "LinkedIn" ? linkedinSteps : emailSteps;
  return steps[idx] ?? `Step ${idx + 1}`;
}

function stepDay(idx: number): number {
  const delays = [1, 3, 5, 8, 12, 18];
  return delays[idx] ?? (idx + 1) * 2;
}
