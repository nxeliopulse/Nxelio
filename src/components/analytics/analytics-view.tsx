"use client";
import { useEffect, useRef, useState } from "react";
import {
  Calendar, Download, Mail, MailOpen, MousePointerClick, Reply,
  Sliders, LayoutGrid, X, TrendingUp, DollarSign, Target,
  Users, Flame, Trophy, Lightbulb, Clock, ArrowUpRight,
  Activity, Zap,
} from "lucide-react";
import {
  Area, AreaChart,
  Bar, BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line, LineChart,
  Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart,
  RadialBar, RadialBarChart,
  ResponsiveContainer,
  Scatter, ScatterChart,
  Tooltip,
  Treemap,
  XAxis, YAxis, ZAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  getAnalyticsStatsRanged,
  getAnalyticsStatsCustom,
} from "@/lib/queries/analytics";
import type { AnalyticsStats } from "@/lib/queries/analytics";

// ── Palette ───────────────────────────────────────────────────────────────────
const TEAL    = "#06B6D4";
const TEAL2   = "#0891B2";
const EMERALD = "#10B981";
const VIOLET  = "#8B5CF6";
const AMBER   = "#F59E0B";
const ROSE    = "#F43F5E";
const INDIGO  = "#6366F1";
const GRAY    = "#94A3B8";
const CYAN_PALETTE = [TEAL, EMERALD, INDIGO, VIOLET, AMBER, ROSE, TEAL2, "#EC4899", "#14B8A6", "#F97316"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color = TEAL, height = 28, width = 72 }: {
  data: number[]; color?: string; height?: number; width?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Shared tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <p className="mb-1.5 font-semibold text-gray-300">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5" style={{ color: p.color ?? "#e2e8f0" }}>
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: p.color ?? "#e2e8f0" }} />
          {p.name}: <span className="font-bold ml-auto pl-3">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-gray-200 mb-1">{d?.name ?? "Campaign"}</p>
      <p className="text-cyan-400">Open: <span className="font-bold">{d?.x}%</span></p>
      <p className="text-violet-400">Reply: <span className="font-bold">{d?.y}%</span></p>
      <p className="text-gray-400">Sent: <span className="font-bold">{d?.z}</span></p>
    </div>
  );
}

// ── Heatmap (custom — not recharts) ──────────────────────────────────────────
const DOW  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? "12a" : i < 12 ? `${i}a` : i === 12 ? "12p" : `${i - 12}p`
);

function Heatmap({ data }: { data: number[][] }) {
  const [tip, setTip] = useState<{ x: number; y: number; v: number; dow: string; hr: string } | null>(null);
  const max = Math.max(...data.flat(), 1);
  return (
    <div className="relative select-none">
      <div className="mb-1 flex pl-9">
        {HOUR.map((h, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-gray-600 leading-none">
            {i % 4 === 0 ? h : ""}
          </div>
        ))}
      </div>
      {data.map((row, dow) => (
        <div key={dow} className="flex items-center mb-0.5">
          <span className="w-8 text-[10px] text-gray-500 shrink-0">{DOW[dow]}</span>
          {row.map((val, hr) => {
            const intensity = val / max;
            const bg = val === 0
              ? "rgba(6,182,212,0.04)"
              : `rgba(6,182,212,${0.1 + intensity * 0.9})`;
            return (
              <div key={hr} className="flex-1 h-5 rounded-[3px] cursor-default transition-opacity hover:opacity-80"
                style={{ background: bg, margin: "0 1px" }}
                onMouseEnter={e => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTip({ x: r.left + r.width / 2, y: r.top, v: val, dow: DOW[dow], hr: HOUR[hr] });
                }}
                onMouseLeave={() => setTip(null)}
              />
            );
          })}
        </div>
      ))}
      <div className="mt-3 flex items-center gap-1.5 justify-end">
        <span className="text-[10px] text-gray-600">Less</span>
        {[0.04, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
          <div key={i} className="w-4 h-3 rounded-sm"
            style={{ background: v < 0.1 ? "rgba(6,182,212,0.04)" : `rgba(6,182,212,${v})` }} />
        ))}
        <span className="text-[10px] text-gray-600">More</span>
      </div>
      {tip && (
        <div className="fixed z-50 pointer-events-none rounded-xl border border-white/10 bg-gray-900/95 px-3 py-1.5 text-xs shadow-xl"
          style={{ left: tip.x, top: tip.y - 44, transform: "translateX(-50%)" }}>
          <span className="font-bold text-cyan-400">{tip.v} activities</span>
          <span className="text-gray-400 ml-1.5">· {tip.dow} {tip.hr}</span>
        </div>
      )}
    </div>
  );
}

// ── Treemap content renderer ───────────────────────────────────────────────────
function TreemapContent(props: {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; value?: number; depth?: number; index?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, value, index = 0 } = props;
  const color = CYAN_PALETTE[index % CYAN_PALETTE.length];
  if (width < 20 || height < 20) return null;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={width - 4} height={height - 4} rx={8}
        fill={`${color}22`} stroke={`${color}55`} strokeWidth={1} />
      {width > 55 && height > 35 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle"
            fill="#e2e8f0" fontSize={11} fontWeight={600}>{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle"
            fill="#94a3b8" fontSize={10}>{fmtCurrency(value ?? 0)}</text>
        </>
      )}
    </g>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ title, subtitle, children, className, action, badge }: {
  title?: string; subtitle?: string; children: React.ReactNode;
  className?: string; action?: React.ReactNode; badge?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {title && <h3 className="text-sm font-semibold text-gray-100">{title}</h3>}
              {badge && <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-400">{badge}</span>}
            </div>
            {subtitle && <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Smart Insights ─────────────────────────────────────────────────────────────
type InsightType = "positive" | "attention" | "info" | "warning";
interface Insight { type: InsightType; icon: React.ReactNode; title: string; body: string; }
const IS: Record<InsightType, string> = {
  positive: "border-emerald-500/20 bg-emerald-500/[0.06]",
  attention: "border-amber-500/20 bg-amber-500/[0.06]",
  info: "border-cyan-500/20 bg-cyan-500/[0.06]",
  warning: "border-rose-500/20 bg-rose-500/[0.06]",
};
const II: Record<InsightType, string> = {
  positive: "text-emerald-400", attention: "text-amber-400", info: "text-cyan-400", warning: "text-rose-400",
};

function computeInsights(s: AnalyticsStats): Insight[] {
  const out: Insight[] = [];
  const totals = s.engagement.map(e => ({ day: e.day, t: e.opens + e.clicks + e.replies }));
  const best = totals.reduce((a, b) => b.t > a.t ? b : a, totals[0]);
  if (best) out.push({ type: "positive", icon: <Trophy size={13} />, title: `Best day: ${best.day}`, body: `${best.t} total interactions — schedule more sends on this day.` });
  const top = [...s.campaignPerf].sort((a, b) => b.openRate - a.openRate)[0];
  if (top) out.push({ type: "info", icon: <Zap size={13} />, title: `Top campaign: ${top.name}`, body: `${top.openRate}% open rate — apply its subject line to other campaigns.` });
  if (s.hotLeads > 0) {
    const pct = s.totalLeads > 0 ? Math.round((s.hotLeads / s.totalLeads) * 100) : 0;
    out.push({ type: "positive", icon: <Flame size={13} />, title: `${s.hotLeads} hot leads (${pct}%)`, body: "Prioritise follow-up — these have the highest engagement scores." });
  }
  if (s.pipelineTotal > 0) out.push({ type: "info", icon: <DollarSign size={13} />, title: `${fmtCurrency(s.pipelineTotal)} in pipeline`, body: `${s.winRate.toFixed(0)}% win rate · avg deal ${fmtCurrency(s.avgDealValue)}.` });
  if (s.replyRate < 3 && s.emailsSent > 50) out.push({ type: "attention", icon: <Lightbulb size={13} />, title: "Reply rate below 3%", body: "Shorten email copy and personalise first lines to improve replies." });
  return out.slice(0, 4);
}

// ── Widget registry ───────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: "kpi",                 label: "KPI Overview",         desc: "Headline metric cards" },
  { id: "engagement",          label: "Engagement Trend",     desc: "Opens, clicks & replies line chart" },
  { id: "funnel",              label: "Conversion Funnel",    desc: "Lead stages & drop-off bars" },
  { id: "composed",            label: "Leads Composed Chart", desc: "Bar + line combined chart" },
  { id: "campaign_comparison", label: "Campaign Comparison",  desc: "Grouped bar per campaign" },
  { id: "lead_growth",         label: "Lead Growth",          desc: "Area chart of new leads" },
  { id: "stacked",             label: "Stacked Activity",     desc: "Daily opens/clicks/replies stacked" },
  { id: "top_campaigns",       label: "Top Campaigns",        desc: "Leaderboard by open rate" },
] as const;
type WidgetId = (typeof WIDGET_DEFS)[number]["id"];
type Visibility = Record<WidgetId, boolean>;
const DEFAULT_VIS: Visibility = {
  kpi: true, engagement: true, funnel: true, composed: true,
  campaign_comparison: true, lead_growth: true, stacked: true, top_campaigns: true,
};
const STORAGE_KEY = "lp_analytics_v2";
function loadVis(): Visibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try { return { ...DEFAULT_VIS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return DEFAULT_VIS; }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type TabId = "overview" | "revenue" | "campaigns" | "activity";
const TABS: { id: TabId; label: string; icon: React.ReactNode; count: string }[] = [
  { id: "overview",  label: "Overview",  icon: <LayoutGrid size={13} />,  count: "4" },
  { id: "revenue",   label: "Revenue",   icon: <DollarSign size={13} />,  count: "4" },
  { id: "campaigns", label: "Campaigns", icon: <Mail size={13} />,        count: "4" },
  { id: "activity",  label: "Activity",  icon: <Activity size={13} />,    count: "2" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export function AnalyticsView({ stats: initialStats }: { stats: AnalyticsStats }) {
  const [stats, setStats] = useState(initialStats);
  const [tab, setTab]   = useState<TabId>("overview");
  const [range, setRange] = useState("30");
  const [vis, setVis]   = useState<Visibility>(DEFAULT_VIS);
  const [customizing, setCustomizing] = useState(false);
  const [customOpen, setCustomOpen]   = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState(todayStr());
  const [loading, setLoading]         = useState(false);
  const prevRange = useRef(range);

  useEffect(() => { setVis(loadVis()); }, []);

  useEffect(() => {
    if (prevRange.current === range) return;
    prevRange.current = range;
    if (range === "custom") { setCustomOpen(true); return; }
    setLoading(true);
    getAnalyticsStatsRanged(Number(range)).then(setStats).finally(() => setLoading(false));
  }, [range]);

  function toggleWidget(id: WidgetId) {
    setVis(v => {
      const next = { ...v, [id]: !v[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function applyCustom() {
    if (!customStart || !customEnd) return;
    setCustomOpen(false);
    setLoading(true);
    try { setStats(await getAnalyticsStatsCustom(customStart, customEnd)); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const rows = [
      ["Emails Sent", stats.emailsSent], ["Open Rate %", stats.openRate],
      ["Click Rate %", stats.clickRate], ["Reply Rate %", stats.replyRate],
      ["Total Leads", stats.totalLeads], ["Hot Leads", stats.hotLeads],
      ["Pipeline Total", stats.pipelineTotal], ["Won Revenue", stats.wonRevenue],
      ["Win Rate %", stats.winRate],
    ];
    const csv = [["Metric", "Value"], ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `nxelio-analytics-${todayStr()}.csv`;
    a.click();
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const convRate  = stats.totalLeads > 0 ? ((stats.convertedLeads / stats.totalLeads) * 100).toFixed(1) : "0.0";
  const insights  = computeInsights(stats);
  const topCamps  = [...stats.campaignPerf].sort((a, b) => b.openRate - a.openRate).slice(0, 5);

  // Chart 1-data – engagement mix donut
  const mixData = [
    { name: "Opens",   value: stats.engagement.reduce((s, e) => s + e.opens, 0),   fill: TEAL },
    { name: "Clicks",  value: stats.engagement.reduce((s, e) => s + e.clicks, 0),  fill: EMERALD },
    { name: "Replies", value: stats.engagement.reduce((s, e) => s + e.replies, 0), fill: VIOLET },
  ];
  const totalInteractions = mixData.reduce((s, d) => s + d.value, 0);

  // Chart: RadialBar – rate gauges
  const radialData = [
    { name: "Reply %",  value: Math.min(stats.replyRate * 10, 100), fill: VIOLET },
    { name: "Click %",  value: Math.min(stats.clickRate * 5, 100),  fill: EMERALD },
    { name: "Open %",   value: Math.min(stats.openRate, 100),       fill: TEAL },
  ];

  // Chart: Radar – performance profile
  const radarData = [
    { metric: "Open Rate",   value: Math.min(stats.openRate, 100) },
    { metric: "Click Rate",  value: Math.min(stats.clickRate * 5, 100) },
    { metric: "Reply Rate",  value: Math.min(stats.replyRate * 5, 100) },
    { metric: "Win Rate",    value: Math.min(stats.winRate, 100) },
    { metric: "Hot Lead %",  value: stats.totalLeads > 0 ? Math.min((stats.hotLeads / stats.totalLeads) * 100, 100) : 0 },
    { metric: "Conversion",  value: Math.min(parseFloat(convRate) * 5, 100) },
  ];

  // Chart: Scatter – campaign efficiency bubble
  const scatterData = stats.campaignPerf.map(c => ({
    x: c.openRate, y: c.replyRate, z: Math.max(c.sent || 50, 20), name: c.name,
  }));

  // Chart: Treemap – pipeline by value
  const treemapData = stats.pipelineByStage
    .filter(s => s.value > 0)
    .map(s => ({ name: s.stage, size: s.value }));

  // Chart: ComposedChart – new leads (bar) + hot leads (line)
  const composedData = stats.leadGrowth.map(e => ({ date: e.date, leads: e.leads, hot: e.hot }));

  // Sparkline arrays
  const spOpens   = stats.engagement.map(e => e.opens);
  const spClicks  = stats.engagement.map(e => e.clicks);
  const spReplies = stats.engagement.map(e => e.replies);
  const spLeads   = stats.leadGrowth.map(e => e.leads);
  const spHot     = stats.leadGrowth.map(e => e.hot);

  const kpiCards = [
    { label: "Emails Sent",     value: stats.emailsSent.toLocaleString(), icon: <Mail size={15} />,             color: TEAL,    sp: spOpens },
    { label: "Open Rate",       value: `${stats.openRate}%`,              icon: <MailOpen size={15} />,          color: EMERALD, sp: spOpens },
    { label: "Click Rate",      value: `${stats.clickRate}%`,             icon: <MousePointerClick size={15} />, color: INDIGO,  sp: spClicks },
    { label: "Reply Rate",      value: `${stats.replyRate}%`,             icon: <Reply size={15} />,             color: VIOLET,  sp: spReplies },
    { label: "Hot Leads",       value: stats.hotLeads.toLocaleString(),   icon: <Flame size={15} />,             color: AMBER,   sp: spHot },
    { label: "Conversion Rate", value: `${convRate}%`,                    icon: <Target size={15} />,            color: ROSE,    sp: spLeads },
  ];

  const revKpis = [
    { label: "Pipeline Value", value: fmtCurrency(stats.pipelineTotal), icon: <TrendingUp size={15} />, color: TEAL },
    { label: "Won Revenue",    value: fmtCurrency(stats.wonRevenue),    icon: <Trophy size={15} />,     color: EMERALD },
    { label: "Win Rate",       value: `${stats.winRate.toFixed(0)}%`,   icon: <Target size={15} />,     color: VIOLET },
    { label: "Avg Deal",       value: fmtCurrency(stats.avgDealValue),  icon: <DollarSign size={15} />, color: AMBER },
  ];

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="relative space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-100 tracking-tight">Analytics</h1>
          <p className="mt-0.5 text-[11px] text-gray-500">14 charts · real-time workspace data</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onChange={e => setRange(e.target.value)}
            className="h-8 text-xs bg-white/[0.04] border-white/10">
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range…</option>
          </Select>
          <button onClick={() => setCustomizing(c => !c)}
            className={cn("flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
              customizing ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200")}
            title="Customize">
            <Sliders size={13} />
          </button>
          <button onClick={exportCSV}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200 transition-colors"
            title="Export CSV">
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 flex items-start justify-center pt-28 rounded-2xl bg-black/30 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full border border-cyan-500/20 bg-gray-900/90 px-4 py-2 text-xs text-cyan-400">
            <div className="h-3 w-3 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            Loading…
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              tab === t.id
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm"
                : "text-gray-400 hover:text-gray-200")}>
            {t.icon} {t.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold",
              tab === t.id ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.06] text-gray-500")}>
              {t.count}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-1">
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", loading ? "bg-amber-400" : "bg-emerald-400")} />
          <span className="text-[10px] text-gray-500">{loading ? "Updating" : "Live"}</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW — Chart 1: Line · Chart 2: Area · Chart 3: ComposedChart  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-5">

          {/* KPI cards with sparklines */}
          {vis.kpi && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {kpiCards.map((k, i) => (
                <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${k.color}22` }}>
                      <span style={{ color: k.color }}>{k.icon}</span>
                    </div>
                    <ArrowUpRight size={11} className="text-gray-600" />
                  </div>
                  <p className="text-[10px] text-gray-500 leading-none">{k.label}</p>
                  <p className="text-lg font-bold text-gray-100 leading-none">{k.value}</p>
                  <div className="mt-0.5"><Sparkline data={k.sp} color={k.color} /></div>
                </div>
              ))}
            </div>
          )}

          {/* Chart 1: LineChart — Engagement Over Time */}
          {vis.engagement && (
            <Panel title="Engagement Over Time" subtitle="Chart 1 · Line chart — opens, clicks & replies"
              action={<div className="flex items-center gap-3"><LegendDot color={TEAL} label="Opens" /><LegendDot color={EMERALD} label="Clicks" /><LegendDot color={VIOLET} label="Replies" /></div>}>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={stats.engagement} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="opens"   name="Opens"   stroke={TEAL}    strokeWidth={2} dot={{ r: 3, fill: TEAL    }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="clicks"  name="Clicks"  stroke={EMERALD} strokeWidth={2} dot={{ r: 3, fill: EMERALD }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="replies" name="Replies" stroke={VIOLET}  strokeWidth={2} dot={{ r: 3, fill: VIOLET  }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* Chart 2 + Chart 3 row */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* Chart 2: AreaChart — Lead Growth */}
            {vis.lead_growth && (
              <Panel title="Lead Growth" subtitle="Chart 2 · Area chart — new leads & hot leads"
                action={<div className="flex items-center gap-3"><LegendDot color={TEAL} label="Leads" /><LegendDot color={AMBER} label="Hot" /></div>}>
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={stats.leadGrowth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TEAL}  stopOpacity={0.3} />
                        <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gHot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={AMBER}  stopOpacity={0.3} />
                        <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="leads" name="Leads" stroke={TEAL}  strokeWidth={2} fill="url(#gLeads)" dot={false} />
                    <Area type="monotone" dataKey="hot"   name="Hot"   stroke={AMBER} strokeWidth={2} fill="url(#gHot)"   dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {/* Chart 3: ComposedChart — bar + line */}
            {vis.composed && (
              <Panel title="New vs Hot Leads" subtitle="Chart 3 · Composed chart — bar + line overlay"
                action={<div className="flex items-center gap-3"><LegendDot color={TEAL} label="Leads" /><LegendDot color={AMBER} label="Hot" /></div>}>
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={composedData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="leads" name="Leads" fill={`${TEAL}44`} stroke={TEAL} strokeWidth={1} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="hot" name="Hot Leads" stroke={AMBER} strokeWidth={2.5} dot={{ r: 4, fill: AMBER }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Panel>
            )}
          </div>

          {/* Funnel + Insights row */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Chart 4: Horizontal BarChart — Conversion Funnel */}
            {vis.funnel && (
              <Panel title="Conversion Funnel" subtitle="Chart 4 · Bar chart — lead stage pipeline" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.funnel} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="stage" type="category" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Leads" radius={[0, 6, 6, 0]}>
                      {stats.funnel.map((_, i) => <Cell key={i} fill={CYAN_PALETTE[i % CYAN_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {/* Smart Insights */}
            <Panel title="Smart Insights" subtitle="AI-derived from your data" action={<Lightbulb size={13} className="text-amber-400" />}>
              <div className="space-y-2.5">
                {insights.length === 0 && <p className="text-xs text-gray-500 py-4 text-center">Add more data to unlock insights.</p>}
                {insights.map((ins, i) => (
                  <div key={i} className={cn("rounded-xl border p-3", IS[ins.type])}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={II[ins.type]}>{ins.icon}</span>
                      <span className="text-xs font-semibold text-gray-200 truncate">{ins.title}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{ins.body}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* REVENUE — Chart 5: Radial · Chart 6: Treemap · Chart 7: Bar        */}
      {/*          Chart 8: Pie donut                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "revenue" && (
        <div className="space-y-5">

          {/* Rev KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {revKpis.map((k, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${k.color}22` }}>
                    <span style={{ color: k.color }}>{k.icon}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{k.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-100">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Chart 5 + Chart 6 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* Chart 5: RadialBarChart — KPI rate gauges */}
            <Panel title="Rate Gauges" subtitle="Chart 5 · Radial bar chart — open/click/reply (scaled)">
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={200} height={200}>
                  <RadialBarChart cx="50%" cy="50%" innerRadius="25%" outerRadius="85%"
                    data={radialData} startAngle={90} endAngle={-270}>
                    <PolarGrid gridType="circle" radialLines={false} stroke="#ffffff08" />
                    <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "#ffffff06" }} />
                    <Tooltip content={<ChartTooltip />} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {radialData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-gray-400">{d.name}</span>
                      <span className="ml-auto font-bold tabular-nums" style={{ color: d.fill }}>{d.value.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Chart 6: PieChart — Engagement Mix donut */}
            <Panel title="Engagement Mix" subtitle="Chart 6 · Donut chart — interaction distribution">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={mixData} cx="50%" cy="50%" innerRadius={46} outerRadius={68}
                        paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                        {mixData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-gray-100">{totalInteractions.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-500">total</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {mixData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                      <span className="text-gray-400 flex-1">{d.name}</span>
                      <span className="font-bold tabular-nums text-gray-200">{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          {/* Chart 7: Treemap — pipeline distribution */}
          <Panel title="Pipeline Distribution" subtitle="Chart 7 · Treemap — deal value area by stage" badge="NEW">
            {treemapData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <Treemap data={treemapData} dataKey="size" aspectRatio={4 / 3}
                  content={<TreemapContent />}>
                  <Tooltip formatter={(v) => fmtCurrency(Number(v))} />
                </Treemap>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">No pipeline data yet</div>
            )}
          </Panel>

          {/* Chart 8: BarChart — lead score distribution */}
          <Panel title="Lead Score Distribution" subtitle="Chart 8 · Bar chart — lead quality buckets">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.leadScoreDist} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[5, 5, 0, 0]}>
                  {stats.leadScoreDist.map((_, i) => <Cell key={i} fill={[GRAY, INDIGO, TEAL, EMERALD, AMBER][i] ?? TEAL} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CAMPAIGNS — Chart 9: Grouped Bar · Chart 10: Stacked Bar           */}
      {/*             Chart 11: Radar · Chart 12: Scatter                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "campaigns" && (
        <div className="space-y-5">

          {/* Chart 9: Grouped BarChart — campaign comparison */}
          {vis.campaign_comparison && (
            <Panel title="Campaign Comparison" subtitle="Chart 9 · Grouped bar chart — open vs reply rate"
              action={<div className="flex items-center gap-3"><LegendDot color={TEAL} label="Open %" /><LegendDot color={VIOLET} label="Reply %" /></div>}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.campaignPerf} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="openRate"  name="Open Rate %"  fill={TEAL}   radius={[4, 4, 0, 0]} />
                  <Bar dataKey="replyRate" name="Reply Rate %" fill={VIOLET} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* Chart 10 + Chart 11 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* Chart 10: Stacked BarChart — daily email activity */}
            {vis.stacked && (
              <Panel title="Daily Email Activity" subtitle="Chart 10 · Stacked bar — opens / clicks / replies"
                action={<div className="flex flex-col gap-1"><LegendDot color={TEAL} label="Opens" /><LegendDot color={EMERALD} label="Clicks" /><LegendDot color={VIOLET} label="Replies" /></div>}>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={stats.engagement} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="opens"   name="Opens"   stackId="a" fill={TEAL}    radius={[0, 0, 0, 0]} />
                    <Bar dataKey="clicks"  name="Clicks"  stackId="a" fill={EMERALD} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="replies" name="Replies" stackId="a" fill={VIOLET}  radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {/* Chart 11: RadarChart — performance profile */}
            <Panel title="Performance Radar" subtitle="Chart 11 · Radar chart — multi-metric profile">
              <ResponsiveContainer width="100%" height={210}>
                <RadarChart data={radarData} cx="50%" cy="50%">
                  <PolarGrid stroke="#ffffff0a" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} />
                  <Radar name="Score (0–100 scaled)" dataKey="value" stroke={TEAL} fill={TEAL} fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip content={<ChartTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Chart 12: ScatterChart — campaign efficiency bubble */}
          <Panel title="Campaign Efficiency Bubble" subtitle="Chart 12 · Scatter chart — open rate vs reply rate (bubble = emails sent)" badge="NEW">
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="x" name="Open Rate %" type="number" unit="%" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} label={{ value: "Open Rate %", position: "insideBottom", offset: -4, fill: "#64748b", fontSize: 10 }} />
                <YAxis dataKey="y" name="Reply Rate %" type="number" unit="%" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} label={{ value: "Reply %", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <ZAxis dataKey="z" range={[40, 400]} name="Sent" />
                <Tooltip content={<ScatterTooltip />} />
                <Scatter data={scatterData} fill={TEAL} fillOpacity={0.6} stroke={TEAL} strokeWidth={1} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>

          {/* Top campaigns leaderboard */}
          {vis.top_campaigns && (
            <Panel title="Campaign Leaderboard" subtitle="Ranked by open rate">
              <div className="space-y-2">
                {topCamps.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                    <span className="w-5 text-xs font-bold tabular-nums text-gray-600">{i + 1}</span>
                    <span className="flex-1 truncate text-xs text-gray-300">{c.name}</span>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-cyan-400 font-semibold">{c.openRate}%</span>
                      <span className="text-gray-600 text-[10px]">open</span>
                      <span className="text-violet-400 font-semibold">{c.replyRate}%</span>
                      <span className="text-gray-600 text-[10px]">reply</span>
                    </div>
                  </div>
                ))}
                {topCamps.length === 0 && <p className="text-xs text-gray-500 py-6 text-center">No campaigns yet</p>}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ACTIVITY — Chart 13: Heatmap · Chart 14: Area                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "activity" && (
        <div className="space-y-5">

          {/* Chart 13: Heatmap (custom SVG) */}
          <Panel title="Engagement Heatmap" subtitle="Chart 13 · Custom heatmap — intensity by day × hour"
            badge="INTERACTIVE" action={<Clock size={13} className="text-cyan-400" />}>
            <Heatmap data={stats.heatmap} />
          </Panel>

          {/* Chart 14: AreaChart + donut */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

            <Panel title="7-Day Trend" subtitle="Chart 14 · Area chart — last 7 days" className="lg:col-span-2"
              action={<div className="flex items-center gap-3"><LegendDot color={TEAL} label="Opens" /><LegendDot color={EMERALD} label="Clicks" /><LegendDot color={VIOLET} label="Replies" /></div>}>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={stats.engagement.slice(-7)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="ao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL}    stopOpacity={0.3} /><stop offset="100%" stopColor={TEAL}    stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ac" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EMERALD} stopOpacity={0.3} /><stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={VIOLET}  stopOpacity={0.3} /><stop offset="100%" stopColor={VIOLET}  stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="opens"   name="Opens"   stroke={TEAL}    strokeWidth={2} fill="url(#ao)" dot={false} />
                  <Area type="monotone" dataKey="clicks"  name="Clicks"  stroke={EMERALD} strokeWidth={2} fill="url(#ac)" dot={false} />
                  <Area type="monotone" dataKey="replies" name="Replies" stroke={VIOLET}  strokeWidth={2} fill="url(#ar)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Interaction Mix" subtitle="Donut — share by type">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={mixData} cx="50%" cy="50%" innerRadius={44} outerRadius={64}
                        paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                        {mixData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-bold text-gray-100">{totalInteractions.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-500">total</span>
                  </div>
                </div>
                <div className="w-full space-y-1.5">
                  {mixData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                      <span className="text-gray-400 flex-1">{d.name}</span>
                      <span className="font-bold text-gray-200 tabular-nums">{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ── Customize slide-over ─────────────────────────────────────────────── */}
      {customizing && (
        <div className="fixed right-0 top-0 z-40 h-full w-72 border-l border-white/[0.08] bg-gray-950/95 backdrop-blur-md shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-100">Customize Widgets</h3>
            <button onClick={() => setCustomizing(false)} className="text-gray-500 hover:text-gray-200"><X size={15} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-[11px] text-gray-500 mb-3">Toggle visibility across Overview & Campaigns tabs.</p>
            {WIDGET_DEFS.map(w => (
              <label key={w.id} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                vis[w.id] ? "border-cyan-500/20 bg-cyan-500/[0.04]" : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]")}>
                <input type="checkbox" checked={vis[w.id]} onChange={() => toggleWidget(w.id)} className="mt-0.5 accent-cyan-500" />
                <div>
                  <p className="text-xs font-medium text-gray-200">{w.label}</p>
                  <p className="text-[11px] text-gray-500">{w.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom date modal ─────────────────────────────────────────────────── */}
      <Modal open={customOpen} onClose={() => { setCustomOpen(false); setRange("30"); }}>
        <div className="space-y-4 p-6">
          <h2 className="text-sm font-semibold text-gray-100">Custom Date Range</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">From</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} max={customEnd}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 focus:border-cyan-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">To</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} min={customStart} max={todayStr()}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 focus:border-cyan-500/50 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => { setCustomOpen(false); setRange("30"); }} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={applyCustom} disabled={!customStart || !customEnd} className="flex-1">Apply</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
