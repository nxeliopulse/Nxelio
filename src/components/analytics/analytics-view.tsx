"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Calendar, Download, Mail, MailOpen, MousePointerClick, MessageCircle,
  Reply, Sliders, LayoutGrid, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { getAnalyticsStatsRanged, getAnalyticsStatsCustom } from "@/lib/queries/analytics";

interface Stats {
  emailsSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  funnel: { stage: string; value: number }[];
  engagement: { day: string; opens: number; clicks: number; replies: number }[];
  leadGrowth: { date: string; leads: number; hot: number }[];
  campaignPerf: { name: string; openRate: number; replyRate: number }[];
}

const BLUE = "#2563eb";
const INDIGO = "#4f46e5";
const GRAY = "#94a3b8";
const ORANGE = "#f59e0b";
const EMERALD = "#10b981";
const VIOLET = "#8b5cf6";

const funnelColors = [BLUE, INDIGO, "#818cf8", EMERALD, ORANGE];

// ── Widget registry ───────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: "kpi",                label: "KPI Overview",        desc: "Headline metrics at a glance" },
  { id: "engagement",         label: "Engagement Over Time", desc: "Opens, clicks & replies trend" },
  { id: "funnel",             label: "Conversion Funnel",   desc: "Lead stages & drop-off" },
  { id: "campaign_comparison",label: "Campaign Comparison", desc: "Open vs reply rate per campaign" },
  { id: "lead_growth",        label: "Lead Growth",         desc: "New leads over time" },
  { id: "engagement_mix",     label: "Engagement Mix",      desc: "Share of opens / clicks / replies" },
  { id: "rate_breakdown",     label: "Rate Breakdown",      desc: "Open, click & reply rates" },
  { id: "top_campaigns",      label: "Top Campaigns",       desc: "Best performers by open rate" },
] as const;

type WidgetId = (typeof WIDGET_DEFS)[number]["id"];
type Visibility = Record<WidgetId, boolean>;

const DEFAULT_VIS: Visibility = {
  kpi: true, engagement: true, funnel: true, campaign_comparison: true,
  lead_growth: true, engagement_mix: false, rate_breakdown: false, top_campaigns: false,
};
const STORAGE_KEY = "lp_analytics_widgets";

function loadVis(): Visibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try { return { ...DEFAULT_VIS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return DEFAULT_VIS; }
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Chart tooltip (matches dashboard) ───────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-xs">
      {label && <p className="mb-1.5 font-semibold text-slate-800">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
            <span className="ml-auto font-semibold text-slate-800">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Consistent card shell so every widget lines up in the reflow grid.
function Panel({ title, desc, legend, children }: {
  title: string; desc?: string; legend?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {legend}
        </div>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

export function AnalyticsView({ stats: initialStats }: { stats: Stats }) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [selectedRange, setSelectedRange] = useState<string>("30");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDates, setCustomDates] = useState<{ start: string; end: string }>({
    start: todayStr(),
    end: todayStr(),
  });
  const [isPending, startTransition] = useTransition();

  const [vis, setVis] = useState<Visibility>(DEFAULT_VIS);
  const [customizing, setCustomizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVis(loadVis()); }, []);

  function toggleWidget(id: WidgetId) {
    setVis((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setCustomizing(false);
    }
    if (customizing) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [customizing]);

  const visibleCount = WIDGET_DEFS.filter((w) => vis[w.id]).length;
  const maxFunnel = Math.max(1, ...stats.funnel.map((f) => f.value));

  // ── Derived data ──────────────────────────────────────────────────────────
  const totals = stats.engagement.reduce(
    (a, d) => ({ opens: a.opens + d.opens, clicks: a.clicks + d.clicks, replies: a.replies + d.replies }),
    { opens: 0, clicks: 0, replies: 0 }
  );
  const mixData = [
    { name: "Opens", value: totals.opens, color: BLUE },
    { name: "Clicks", value: totals.clicks, color: VIOLET },
    { name: "Replies", value: totals.replies, color: EMERALD },
  ];
  const mixTotal = totals.opens + totals.clicks + totals.replies;
  const rateRows = [
    { label: "Open rate", value: stats.openRate, color: BLUE },
    { label: "Click rate", value: stats.clickRate, color: VIOLET },
    { label: "Reply rate", value: stats.replyRate, color: EMERALD },
  ];
  const topCampaigns = [...stats.campaignPerf].sort((a, b) => b.openRate - a.openRate).slice(0, 5);
  const maxOpen = Math.max(1, ...topCampaigns.map((c) => c.openRate));

  const kpiCards = [
    { label: "Emails sent", value: stats.emailsSent.toLocaleString(), Icon: Mail, color: "bg-blue-50 text-blue-600" },
    { label: "Open rate", value: `${stats.openRate}%`, Icon: MailOpen, color: "bg-emerald-50 text-emerald-600" },
    { label: "Click rate", value: `${stats.clickRate}%`, Icon: MousePointerClick, color: "bg-indigo-50 text-indigo-600" },
    { label: "Reply rate", value: `${stats.replyRate}%`, Icon: MessageCircle, color: "bg-amber-50 text-amber-600" },
    { label: "Total opens", value: totals.opens.toLocaleString(), Icon: MailOpen, color: "bg-sky-50 text-sky-600" },
    { label: "Total replies", value: totals.replies.toLocaleString(), Icon: Reply, color: "bg-violet-50 text-violet-600" },
  ];

  function handleRangeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setSelectedRange(v);
    startTransition(async () => {
      const next = v === "year"
        ? await getAnalyticsStatsRanged("year")
        : await getAnalyticsStatsRanged(Number(v));
      setStats(next);
    });
  }

  function handleApplyCustom() {
    startTransition(async () => {
      const next = await getAnalyticsStatsCustom(customDates.start, customDates.end);
      setStats(next);
      setCustomOpen(false);
    });
  }

  function handleExport() {
    const rows: string[] = [];
    rows.push("Summary");
    rows.push("Label,Value");
    rows.push(`Emails Sent,${csvEscape(stats.emailsSent)}`);
    rows.push(`Open Rate,${csvEscape(stats.openRate + "%")}`);
    rows.push(`Click Rate,${csvEscape(stats.clickRate + "%")}`);
    rows.push(`Reply Rate,${csvEscape(stats.replyRate + "%")}`);
    rows.push("");
    rows.push("Campaign Comparison");
    rows.push("Campaign,Open%,Reply%");
    for (const c of stats.campaignPerf) {
      rows.push(`${csvEscape(c.name)},${csvEscape(c.openRate)},${csvEscape(c.replyRate)}`);
    }
    rows.push("");
    rows.push("Conversion Funnel");
    rows.push("Stage,Count");
    for (const f of stats.funnel) {
      rows.push(`${csvEscape(f.stage)},${csvEscape(f.value)}`);
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nxelio-analytics-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Campaign performance, conversion & engagement insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select className="max-w-[140px]" value={selectedRange} onChange={handleRangeChange} disabled={isPending}>
            <option value="30">Last 30 days</option>
            <option value="7">Last 7 days</option>
            <option value="90">Last 90 days</option>
            <option value="year">This year</option>
          </Select>
          <Button variant="outline" size="icon" title="Custom date range" aria-label="Custom date range" onClick={() => setCustomOpen(true)} disabled={isPending}>
            <Calendar className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" title="Export CSV" aria-label="Export CSV" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" title="Customize cards" aria-label="Customize cards" onClick={() => setCustomizing(true)}>
            <Sliders className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      {vis.kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map((s) => (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.Icon className="h-4 w-4" strokeWidth={2} />
                </div>
              </div>
              <p className="text-xl font-bold text-slate-900 leading-none">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ── Reflow grid: only visible widgets render, so the grid always fills ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {vis.engagement && (
          <Panel
            title="Engagement over time"
            desc="Opens, clicks and replies"
            legend={
              <div className="flex items-center gap-3">
                <LegendDot color={BLUE} label="Opens" />
                <LegendDot color={VIOLET} label="Clicks" />
                <LegendDot color={EMERALD} label="Replies" />
              </div>
            }
          >
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.engagement} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <XAxis dataKey="day" stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} dy={6} />
                  <YAxis stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Line type="monotone" dataKey="opens" name="Opens" stroke={BLUE} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="clicks" name="Clicks" stroke={VIOLET} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="replies" name="Replies" stroke={EMERALD} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {vis.funnel && (
          <Panel title="Conversion funnel" desc="All leads · current range">
            <div className="space-y-2">
              {stats.funnel.map((s, i) => {
                const pct = (s.value / maxFunnel) * 100;
                const prev = i > 0 ? stats.funnel[i - 1].value : null;
                const conv = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
                return (
                  <div key={s.stage}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700 font-medium">{s.stage}</span>
                      <span className="font-semibold text-slate-900">{s.value.toLocaleString()}</span>
                    </div>
                    <div className="h-7 bg-slate-100 rounded-md overflow-hidden flex items-center">
                      <div className="h-full rounded-md flex items-center justify-end px-2 flex-shrink-0" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: funnelColors[i % funnelColors.length] }}>
                        {pct >= 12 && <span className="text-xs font-semibold text-white">{pct.toFixed(1)}%</span>}
                      </div>
                      {pct < 12 && <span className="text-xs font-semibold text-slate-600 px-2">{pct.toFixed(1)}%</span>}
                    </div>
                    {conv && <p className="text-xs text-slate-500 mt-0.5">{conv}% from prev stage</p>}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {vis.campaign_comparison && (
          <Panel
            title="Campaign comparison"
            desc="Performance across top campaigns"
            legend={
              <div className="flex items-center gap-3">
                <LegendDot color={BLUE} label="Open %" />
                <LegendDot color={EMERALD} label="Reply %" />
              </div>
            }
          >
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.campaignPerf} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} dy={6} />
                  <YAxis stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(37,99,235,0.04)" }} />
                  <Bar dataKey="openRate" name="Open %" fill={BLUE} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="replyRate" name="Reply %" fill={EMERALD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {vis.lead_growth && (
          <Panel title="Lead growth" desc="New leads over time">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.leadGrowth} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ga1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BLUE} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} dy={6} />
                  <YAxis stroke={GRAY} fontSize={11} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke={BLUE} strokeWidth={2.5} fill="url(#ga1)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {vis.engagement_mix && (
          <Panel title="Engagement mix" desc="Share of opens, clicks & replies">
            {mixTotal === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">No engagement yet.</div>
            ) : (
              <div className="h-[280px] flex items-center gap-4">
                <div className="relative h-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={mixData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                        {mixData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-slate-900">{mixTotal.toLocaleString()}</span>
                    <span className="text-xs text-slate-400">total events</span>
                  </div>
                </div>
                <ul className="space-y-2 pr-2">
                  {mixData.map((m) => (
                    <li key={m.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                      <span className="text-slate-600">{m.name}</span>
                      <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                        {mixTotal > 0 ? Math.round((m.value / mixTotal) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}

        {vis.rate_breakdown && (
          <Panel title="Rate breakdown" desc="Open, click & reply rates">
            <div className="space-y-4 py-2">
              {rateRows.map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-slate-600">{r.label}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{r.value}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, r.value)}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {vis.top_campaigns && (
          <Panel title="Top campaigns" desc="Best performers by open rate">
            {topCampaigns.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-sm text-slate-400">No campaigns yet.</div>
            ) : (
              <ul className="space-y-3">
                {topCampaigns.map((c, i) => (
                  <li key={c.name + i} className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-700 truncate pr-2">{c.name}</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{c.openRate}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(c.openRate / maxOpen) * 100}%`, background: BLUE }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {visibleCount === 0 && (
        <div className="text-center py-16 text-slate-400">
          <LayoutGrid className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No widgets visible. Click <span className="font-medium text-slate-600">Customize</span> to add some.</p>
        </div>
      )}

      {/* ── Custom date range modal ── */}
      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
        description="Pick a start and end date to filter analytics"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Start date</label>
            <input
              type="date"
              value={customDates.start}
              max={customDates.end}
              onChange={(e) => setCustomDates((d) => ({ ...d, start: e.target.value }))}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">End date</label>
            <input
              type="date"
              value={customDates.end}
              min={customDates.start}
              max={todayStr()}
              onChange={(e) => setCustomDates((d) => ({ ...d, end: e.target.value }))}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCustomOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleApplyCustom} disabled={isPending || !customDates.start || !customDates.end}>
              {isPending ? "Applying..." : "Apply"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Customize panel (slide-over) ── */}
      <div
        className={cn("fixed inset-0 bg-black/20 z-40 transition-opacity duration-200", customizing ? "opacity-100" : "opacity-0 pointer-events-none")}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 right-0 h-full w-80 max-w-[calc(100vw-2rem)] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out",
          customizing ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Customize Analytics</h2>
          </div>
          <button onClick={() => setCustomizing(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Cards</p>
          {WIDGET_DEFS.map((w) => (
            <button
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all",
                vis[w.id] ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <div className={cn("mt-0.5 h-5 w-9 rounded-full flex-shrink-0 transition-colors relative", vis[w.id] ? "bg-blue-600" : "bg-slate-200")}>
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", vis[w.id] ? "translate-x-4" : "translate-x-0.5")} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", vis[w.id] ? "text-blue-900" : "text-slate-700")}>{w.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{w.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-400 text-center">{visibleCount} of {WIDGET_DEFS.length} cards visible</p>
          <button
            onClick={() => { setVis(DEFAULT_VIS); localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VIS)); }}
            className="w-full py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Reset to default
          </button>
          <button
            onClick={() => setCustomizing(false)}
            className="w-full py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: BLUE }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
