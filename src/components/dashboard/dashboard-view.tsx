"use client";
import { Suspense, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, Check, X, ArrowUpRight, ChevronDown, ChevronRight,
  Pencil, GripVertical, Plus, Save, LayoutGrid, Star, Trash2, Flame, Mail, FileDown, Video, CalendarClock, MousePointerClick, Gauge, FileText, Maximize2,
  TrendingUp, TrendingDown, Globe2, Zap, BarChart3, Lightbulb, Sparkles, AlertTriangle, Target, Users, Layers, Filter, Briefcase, Play, Calendar,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { STAGE_LABELS } from "@/lib/opportunities";
import type { DashboardStats } from "@/lib/queries/analytics";
import { buildAiDashboardSummary } from "@/lib/ai/dashboard-insights";
import type { AiCreditsUsage } from "@/lib/queries/credits";
import { usePageTour } from "@/components/tour/use-page-tour";
import { DASHBOARD_TOUR_STEPS } from "@/components/tour/tour-registry";
import {
  WIDGET_CATALOG, WIDGET_CATEGORIES, WIDGET_SIZES, DEFAULT_LAYOUT, clampWidgetSize,
  type WidgetKey, type WidgetSize, type LayoutWidget,
} from "@/lib/dashboard-widgets";
import { completeSetupTask, dismissSetupTask } from "@/lib/queries/setup-tasks";
import type { DashboardLayout } from "@/lib/queries/dashboard-layouts";
import {
  createDashboardLayout, updateDashboardLayout, deleteDashboardLayout, setActiveDashboardLayout,
} from "@/lib/queries/dashboard-layouts";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Mixes `hex` toward `toward` (white/black) by `ratio` (0 = no change, 1 =
 *  fully `toward`) — used to derive a small family of tints/shades from the
 *  user's actual accent color for chart series/donut slices, instead of a
 *  fixed indigo/blue/green palette unrelated to whatever they've picked in
 *  Settings > Appearance. */
function mixWith(hex: string, toward: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const r = Math.round(a.r + (b.r - a.r) * ratio);
  const g = Math.round(a.g + (b.g - a.g) * ratio);
  const bl = Math.round(a.b + (b.b - a.b) * ratio);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Reads the real, live `--primary` accent color (Settings > Appearance —
 *  teal by default, but the user can switch to indigo/blue/emerald/etc.) so
 *  the dashboard's charts match whatever theme is actually active instead of
 *  a hardcoded color, and update live if it's changed while this page is
 *  open. CSS custom properties aren't guaranteed to resolve inside SVG
 *  `fill`/`stroke` attributes the way they do in regular style props, so
 *  this reads the resolved hex via getComputedStyle rather than passing
 *  `var(--primary)` straight through to recharts. */
function useThemeAccent(): string {
  const [color, setColor] = useState("#18A7B8");
  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      if (v) setColor(v);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent-color", "class"] });
    return () => observer.disconnect();
  }, []);
  return color;
}

// Fixed, mutually-distinct hues for donut slices and paired trend lines —
// a single-hue tint family (all shades of one accent) made same-size slices
// and paired lines hard to tell apart, so these stay constant regardless of
// the user's chosen theme accent, same reasoning as the KPI tiles' fixed
// purple/blue/green. Module-level (not per-component) so every widget,
// including standalone ones like LeadSourcesCard, shares the same palette.
const DONUT_COLORS = ["#6366F1", "#06B6D4", "#F59E0B", "#F43F5E", "#10B981", "#A855F7"];

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatStat(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Shown instead of a bare, values-all-zero chart with an engaging icon and guidance */
function EmptyChartState({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-4 py-6">
      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2.5 text-slate-400">
        <BarChart3 className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-[260px] mb-2">{label}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold text-[var(--primary)] bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <Plus className="h-3 w-3" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

const SPARKLINE_STROKES: Record<string, string> = {
  blue: "#3B82F6",
  indigo: "#6366F1",
  emerald: "#10B981",
  amber: "#F59E0B",
  purple: "#8B5CF6",
  cyan: "#06B6D4",
  rose: "#F43F5E",
};

function MiniSparkline({ color = "#6366F1", isUp = true }: { color?: string; isUp?: boolean }) {
  const d = isUp
    ? "M 2,20 Q 22,23 38,14 T 68,16 T 98,4"
    : "M 2,5 Q 22,4 38,15 T 68,12 T 98,22";
  return (
    <svg width="86" height="26" viewBox="0 0 100 26" fill="none" className="shrink-0 opacity-80" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Modern Express / DealDeck style KPI Card */
function ModernStatTile({
  label, value, sublabel, icon, variant = "default", trendPct, accentColor = "indigo", showSparkline = true, onClick,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  variant?: "hero" | "default";
  trendPct?: number | null;
  accentColor?: "blue" | "indigo" | "emerald" | "amber" | "purple" | "cyan" | "rose";
  showSparkline?: boolean;
  onClick?: () => void;
}) {
  const hasTrend = trendPct !== undefined && trendPct !== null;
  const isUp = hasTrend && trendPct >= 0;

  if (variant === "hero") {
    return (
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
        className={`rounded-2xl p-5 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 text-white relative shadow-xs hover:shadow-md transition-all flex flex-col justify-between min-h-[128px] ${
          onClick ? "cursor-pointer hover:-translate-y-0.5" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-2xs">
            {icon}
          </div>
          {hasTrend && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: isUp ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)", color: isUp ? "#6EE7B7" : "#FDA4AF" }}
            >
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trendPct).toFixed(1)}% vs last 30 days
            </span>
          )}
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/90 block">{label}</span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white mt-1">{value}</h2>
            <p className="text-xs font-medium text-white/80 mt-1 truncate">{sublabel}</p>
          </div>
          {showSparkline && (
            <MiniSparkline color="#FFFFFF" isUp={isUp} />
          )}
        </div>
      </div>
    );
  }

  const ACCENT_STYLES = {
    blue: "bg-gradient-to-tr from-blue-600 to-sky-400 text-white shadow-sm shadow-blue-500/25 border-blue-400/30",
    indigo: "bg-gradient-to-tr from-indigo-600 to-purple-500 text-white shadow-sm shadow-indigo-500/25 border-indigo-400/30",
    emerald: "bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-sm shadow-emerald-500/25 border-emerald-400/30",
    amber: "bg-gradient-to-tr from-amber-500 to-orange-400 text-white shadow-sm shadow-amber-500/25 border-amber-400/30",
    purple: "bg-gradient-to-tr from-purple-600 to-pink-500 text-white shadow-sm shadow-purple-500/25 border-purple-400/30",
    cyan: "bg-gradient-to-tr from-cyan-600 to-blue-400 text-white shadow-sm shadow-cyan-500/25 border-cyan-400/30",
    rose: "bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-sm shadow-rose-500/25 border-rose-400/30",
  };

  const CARD_TOP_BORDERS = {
    blue: "border-t-2 border-t-blue-500 dark:border-t-blue-400 hover:border-blue-300 dark:hover:border-blue-700/60",
    indigo: "border-t-2 border-t-indigo-500 dark:border-t-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700/60",
    emerald: "border-t-2 border-t-emerald-500 dark:border-t-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700/60",
    amber: "border-t-2 border-t-amber-500 dark:border-t-amber-400 hover:border-amber-300 dark:hover:border-amber-700/60",
    purple: "border-t-2 border-t-purple-500 dark:border-t-purple-400 hover:border-purple-300 dark:hover:border-purple-700/60",
    cyan: "border-t-2 border-t-cyan-500 dark:border-t-cyan-400 hover:border-cyan-300 dark:hover:border-cyan-700/60",
    rose: "border-t-2 border-t-rose-500 dark:border-t-rose-400 hover:border-rose-300 dark:hover:border-rose-700/60",
  };

  const sparklineColor = SPARKLINE_STROKES[accentColor] || "#6366F1";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl p-5 bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white relative shadow-xs hover:shadow-md transition-all flex flex-col justify-between min-h-[128px] ${CARD_TOP_BORDERS[accentColor]} ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${ACCENT_STYLES[accentColor]}`}>
          {icon}
        </div>
        {hasTrend && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isUp
                ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50"
                : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
            }`}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trendPct).toFixed(1)}% vs last 30 days
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white block">{label}</span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-slate-900 dark:text-white mt-1">{value}</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-100 mt-1 truncate">{sublabel}</p>
        </div>
        {showSparkline && (
          <MiniSparkline color={sparklineColor} isUp={isUp} />
        )}
      </div>
    </div>
  );
}

type TrendPoint = { month: string; value: number; count: number };

const PERIOD_OPTIONS: { key: "weekly" | "monthly" | "yearly"; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

/** A trend panel with two series on separate axes — a money line (left
 *  axis) and a count line (right axis) */
function DualLineTrendCard({
  title, subtitle, data, moneyKey, countKey, lineColor, lineColorSoft, emptyLabel, mounted, onOpen, actionLabel,
}: {
  title: string; subtitle: string;
  data: { weekly: TrendPoint[]; monthly: TrendPoint[]; yearly: TrendPoint[] };
  moneyKey: string; countKey: string;
  lineColor: string; lineColorSoft: string;
  emptyLabel: string; mounted: boolean;
  onOpen?: () => void; actionLabel?: string;
}) {
  const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const points = data[period];
  const total = points.reduce((s, d) => s + d.value + d.count, 0);
  const chartData = points.map((d) => ({ month: d.month, [moneyKey]: d.value, [countKey]: d.count }));
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-base font-bold text-slate-900 dark:text-white">{title}</h5>
        {onOpen && (
          <button
            onClick={onOpen}
            className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-200">{subtitle}</p>
        <div className="flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-[var(--muted)] p-0.5 shrink-0">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={
                "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors " +
                (period === opt.key
                  ? "bg-white dark:bg-[#1b212e] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} actionLabel={actionLabel} onAction={onOpen} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                formatter={(v, name) => (name === moneyKey ? money(Number(v)) : v)}
              />
              <Line yAxisId="left" type="monotone" dataKey={moneyKey} stroke={lineColor} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey={countKey} stroke={lineColorSoft} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </Card>
  );
}

/** A modern donut chart with centered total count and bottom legend chips */
function LabeledDonutCard({
  title, data, mounted, emptyLabel, onOpen,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
  mounted: boolean; emptyLabel: string;
  onOpen: () => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const withPct = data.map((d) => ({ ...d, pct: total ? Math.round((d.value / total) * 1000) / 10 : 0 }));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h5>
        <button
          onClick={onOpen}
          className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col justify-center">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col min-w-0">
            <div className="h-[190px] min-w-0 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Tooltip
                    formatter={(v, name) => [`${v} (${withPct.find((p) => p.name === name)?.pct ?? 0}%)`, name]}
                  />
                  <Pie
                    data={withPct}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                    onMouseEnter={(_, idx) => setActiveIndex(idx)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {withPct.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.color}
                        fillOpacity={activeIndex === null || activeIndex === idx ? 1 : 0.35}
                        style={{ transition: "fill-opacity 150ms", cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900 dark:text-white leading-none">{total}</span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-200 uppercase tracking-wider mt-0.5">Deals</span>
              </div>
            </div>
            {/* Clean bottom legend chips */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.slice(0, 6).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 mr-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-slate-600 dark:text-white truncate text-[11px] font-medium" title={item.name}>{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-white text-[11px] shrink-0">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Per-teammate deals closed vs. revenue won, all-time, top 4 by revenue */
function TeamPerformanceBarCard({
  data, mounted, emptyLabel, onOpen,
}: {
  data: { name: string; dealsCount: number; wonValue: number }[];
  mounted: boolean; emptyLabel: string;
  onOpen?: () => void;
}) {
  const total = data.reduce((s, d) => s + d.dealsCount + d.wonValue, 0);
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Team performance</h5>
          <p className="text-xs text-slate-500 dark:text-slate-200">All-time deals closed vs. revenue won, by teammate</p>
        </div>
        {onOpen && (
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            View Team <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 min-w-0 mt-2">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} angle={-20} textAnchor="end" height={30} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                formatter={(v, name) => (name === "wonValue" ? money(Number(v)) : v)}
              />
              <Legend
                formatter={(value) => (value === "dealsCount" ? "Deals count" : value === "wonValue" ? "Won value" : value)}
                wrapperStyle={{ fontSize: "12px" }}
              />
              <Bar yAxisId="left" dataKey="dealsCount" name="Deals count" fill="#6366F1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar yAxisId="right" dataKey="wonValue" name="Won value" fill="#06B6D4" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </Card>
  );
}

/** "Deal outcomes" donut with centered stats and clean legend row */
function DealOutcomesDonutCard({
  title, data, mounted, emptyLabel, onOpen,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
  mounted: boolean; emptyLabel: string;
  onOpen: () => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const withPct = data.map((d) => ({ ...d, pct: total ? Math.round((d.value / total) * 1000) / 10 : 0 }));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-base font-bold text-slate-900 dark:text-white">{title}</h5>
        <button
          onClick={onOpen}
          className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col justify-center">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col min-w-0">
            <div className="h-[190px] min-w-0 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                    formatter={(v, name) => [`${v} deals (${withPct.find((p) => p.name === name)?.pct ?? 0}%)`, name]}
                  />
                  <Pie
                    data={withPct}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                    onMouseEnter={(_, idx) => setActiveIndex(idx)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {withPct.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.color}
                        fillOpacity={activeIndex === null || activeIndex === idx ? 1 : 0.35}
                        style={{ transition: "fill-opacity 150ms", cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">{total}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-200 uppercase tracking-wider mt-1">Total Deals</span>
              </div>
            </div>
            {/* Clean bottom legend row with badge pills */}
            <div className="flex items-center justify-around gap-2 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-slate-600 dark:text-white font-medium text-xs">{item.name}:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{item.value} ({item.pct}%)</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Visual lead conversion funnel */
function LeadFunnelCard({ data, onOpen }: { data: { stage: string; count: number; pct: number }[]; onOpen: () => void }) {
  const router = useRouter();
  const STAGE_BARS = [
    { bg: "bg-gradient-to-r from-blue-500 to-indigo-600 shadow-xs shadow-indigo-500/20" },
    { bg: "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-xs shadow-purple-500/20" },
    { bg: "bg-gradient-to-r from-purple-500 to-pink-500 shadow-xs shadow-pink-500/20" },
    { bg: "bg-gradient-to-r from-emerald-400 to-teal-500 shadow-xs shadow-teal-500/20" },
  ];

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-indigo-500" />
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Lead Funnel</h5>
        </div>
        <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View Details <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-3 py-2">
        {data.length === 0 ? (
          <EmptyChartState label="No lead funnel data yet." actionLabel="Add Leads" onAction={onOpen} />
        ) : (
          data.map((item, idx) => {
            const bar = STAGE_BARS[idx] || STAGE_BARS[0];
            const lower = item.stage.toLowerCase();
            const targetHref = lower.includes("qual")
              ? "/leads?filter=qualified"
              : lower.includes("opp") || lower.includes("conv") || lower.includes("deal")
              ? "/opportunities"
              : lower.includes("engag")
              ? "/campaigns"
              : "/leads";
            const barWidthPct = Math.max(8, Math.min(100, item.pct));

            return (
              <div
                key={item.stage}
                onClick={() => router.push(targetHref)}
                className="flex items-center gap-4 cursor-pointer p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(targetHref);
                  }
                }}
              >
                <div className="flex-1 flex justify-center">
                  <div
                    className={`h-6 ${bar.bg} rounded-md shadow-2xs group-hover:opacity-90 transition-all duration-300`}
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>
                <div className="w-36 flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900 dark:text-white">{item.count.toLocaleString("en-US")}</span>
                  <span className="text-slate-600 dark:text-white font-semibold px-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.stage}</span>
                  <span className="font-bold text-slate-800 dark:text-white">{item.pct}%</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/** New leads vs. qualified leads grouped bar chart */
function LeadGrowthCard({
  data,
  groupedData,
  mounted,
  emptyLabel,
  onOpen,
}: {
  data: { date: string; leads: number; hot: number }[];
  groupedData?: { date: string; newLeads: number; qualifiedLeads: number }[];
  mounted: boolean;
  emptyLabel: string;
  onOpen?: () => void;
}) {
  const chartItems = groupedData && groupedData.length > 0
    ? groupedData
    : data.map((d) => ({ date: d.date, newLeads: d.leads, qualifiedLeads: d.hot }));

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Lead Growth</h5>
          <p className="text-xs text-slate-500 dark:text-white">New vs. Qualified Leads</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#6366F1]" />
              <span className="text-slate-700 dark:text-white font-semibold text-[11px]">New</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              <span className="text-slate-700 dark:text-white font-semibold text-[11px]">Qualified</span>
            </div>
          </div>
          {onOpen && (
            <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
              View Leads <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 mt-3">
        {!mounted ? null : chartItems.length === 0 || chartItems.every((i) => i.newLeads === 0 && i.qualifiedLeads === 0) ? (
          <EmptyChartState label={emptyLabel} actionLabel="View Leads" onAction={onOpen} />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartItems} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
              />
              <Bar dataKey="newLeads" name="New Leads" fill="#6366F1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="qualifiedLeads" name="Qualified Leads" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

/** Hot lead alerts with rich statuses and relative times */
function HotLeadAlertsCard({
  alertsList,
  data,
  emptyLabel,
  onOpen,
}: {
  alertsList?: { id: string; name: string; company: string; intent: "High Intent" | "Engaged"; timeAgo: string; score: number }[];
  data: { name: string; company: string; score: number }[];
  emptyLabel: string;
  onOpen: () => void;
}) {
  const items = alertsList && alertsList.length > 0
    ? alertsList
    : (data && data.length > 0
        ? data.map((d, i) => ({
            id: String(i),
            name: d.name,
            company: d.company,
            intent: (d.score >= 80 ? "High Intent" : "Engaged") as "High Intent" | "Engaged",
            timeAgo: i === 0 ? "5 min ago" : i === 1 ? "42 min ago" : `${i + 1} hours ago`,
            score: d.score,
          }))
        : []
      );

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-rose-500" />
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Hot Lead Alerts</h5>
        </div>
        <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View All <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {items.length === 0 ? (
          <EmptyChartState label={emptyLabel} actionLabel="View Leads" onAction={onOpen} />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1">
            {items.slice(0, 4).map((item) => {
              const initials = item.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "LD";
              const isHigh = item.intent === "High Intent";
              return (
                <button
                  key={item.id}
                  onClick={onOpen}
                  className="w-full flex items-center justify-between py-2 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 text-white shadow-xs ${
                      isHigh ? "bg-gradient-to-tr from-rose-500 to-orange-400" : "bg-gradient-to-tr from-indigo-500 to-purple-500"
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-white font-medium truncate">{item.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isHigh
                        ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50"
                        : "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50"
                    }`}>
                      {item.intent}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-200 font-medium">{item.timeAgo}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-200 group-hover:text-slate-600 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  email: Mail, page: FileText, download: FileDown, webinar: Video,
  meeting: CalendarClock, click: MousePointerClick, score: Gauge,
};

/** Live feed of what's happening */
function RecentActivityCard({ data, emptyLabel, onOpen }: { data: { id: string; lead: string; action: string; type: string; time: string }[]; emptyLabel: string; onOpen?: () => void }) {
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-base font-bold text-slate-900 dark:text-white">Recent activity</h5>
        {onOpen && (
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            View All <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {data.length === 0 ? (
        <div className="flex-1 min-h-0"><EmptyChartState label={emptyLabel} /></div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto">
          {data.slice(0, 6).map((a) => {
            const Icon = ACTIVITY_ICONS[a.type] ?? FileText;
            return (
              <div
                key={a.id}
                onClick={onOpen}
                className={`flex items-center gap-3 py-2 px-2 rounded-xl transition-colors ${onOpen ? "hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}
                role={onOpen ? "button" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onOpen && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onOpen();
                  }
                }}
              >
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-[var(--muted)] flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <p className="flex-1 min-w-0 text-xs text-slate-600 dark:text-white truncate">
                  <span className="font-semibold text-slate-900 dark:text-white">{a.lead}</span> {a.action}
                </p>
                <span className="text-xs text-slate-400 dark:text-slate-200 shrink-0">{a.time}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Campaign performance table */
function CampaignPerformanceCard({
  campaignsTable,
  data,
  mounted,
  emptyLabel,
  onOpen,
}: {
  campaignsTable?: { name: string; leads: number; openRate: number; clickRate: number; conversionRate: number }[];
  data: { name: string; openRate: number; replyRate: number }[];
  mounted: boolean;
  emptyLabel: string;
  onOpen?: () => void;
}) {
  const rows = campaignsTable && campaignsTable.length > 0
    ? campaignsTable
    : (data && data.length > 0
        ? data.map((c) => ({
            name: c.name,
            leads: 0,
            openRate: c.openRate,
            clickRate: Math.round(c.openRate * 0.25),
            conversionRate: c.replyRate,
          }))
        : []
      );

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-indigo-500" />
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Campaign Performance</h5>
        </div>
        {onOpen && (
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            View All Campaigns <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {rows.length === 0 ? (
          <EmptyChartState label={emptyLabel} actionLabel="View Campaigns" onAction={onOpen} />
        ) : (
          <div className="flex-1 overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[340px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-white uppercase tracking-wider">
                  <th className="text-left pb-2 font-semibold">Campaign</th>
                  <th className="text-right pb-2 font-semibold">Leads</th>
                  <th className="text-right pb-2 font-semibold">Open Rate</th>
                  <th className="text-right pb-2 font-semibold">Click Rate</th>
                  <th className="text-right pb-2 font-semibold">Conversions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.slice(0, 4).map((c, idx) => (
                  <tr
                    key={idx}
                    onClick={onOpen}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen?.();
                      }
                    }}
                  >
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate max-w-[120px] transition-colors">{c.name}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-700 dark:text-white">{c.leads}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-700 dark:text-white">{c.openRate}%</td>
                    <td className="py-2.5 text-right font-semibold text-slate-700 dark:text-white">{c.clickRate}%</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{c.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Lead sources donut breakdown */
function LeadSourcesCard({
  data,
  totalLeads,
  mounted,
  emptyLabel,
  onOpen,
}: {
  data: { name: string; value: number; count?: number }[];
  totalLeads?: number;
  mounted: boolean;
  emptyLabel: string;
  onOpen: () => void;
}) {
  const colored = data.map((d, idx) => ({ ...d, color: DONUT_COLORS[idx % DONUT_COLORS.length] }));

  // Check if any element has count
  const sumOfCounts = colored.reduce((s, d) => s + (typeof d.count === "number" ? d.count : 0), 0);
  const totalCount = typeof totalLeads === "number" && totalLeads > 0
    ? totalLeads
    : sumOfCounts > 0
    ? sumOfCounts
    : Math.round(colored.reduce((s, d) => s + d.value, 0));

  const withPct = colored.map((d) => {
    let pct = d.value;
    if (typeof d.count === "number" && totalCount > 0) {
      pct = Math.round((d.count / totalCount) * 1000) / 10;
    } else if (totalCount > 0 && d.value > totalCount) {
      pct = Math.round((d.value / totalCount) * 1000) / 10;
    }
    return { ...d, pct };
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-indigo-500" />
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Lead Sources</h5>
        </div>
        <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View Source Report <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col justify-center">
        {totalCount === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col min-w-0">
            <div className="h-[190px] min-w-0 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Tooltip
                    formatter={(v, name) => {
                      const item = withPct.find((p) => p.name === name);
                      const leadCount = typeof item?.count === "number" ? item.count : (typeof v === "number" ? v : 0);
                      return [`${formatStat(leadCount)} leads (${item?.pct ?? 0}%)`, name];
                    }}
                  />
                  <Pie
                    data={withPct}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey={sumOfCounts > 0 ? "count" : "value"}
                    stroke="none"
                    isAnimationActive={false}
                    onMouseEnter={(_, idx) => setActiveIndex(idx)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {withPct.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.color}
                        fillOpacity={activeIndex === null || activeIndex === idx ? 1 : 0.35}
                        style={{ transition: "fill-opacity 150ms", cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                  {formatStat(totalCount)}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-200 uppercase tracking-wider mt-1">Leads</span>
              </div>
            </div>
            {/* Clean bottom legend chips */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.slice(0, 6).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 mr-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-slate-700 dark:text-white font-medium truncate text-xs" title={item.name}>{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-xs shrink-0">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Sales Pipeline horizontal stage bars */
function SalesPipelineStageCard({ data, onOpen }: { data: { label: string; value: number; count: number }[]; onOpen: () => void }) {
  const STAGE_COLORS = ["#818CF8", "#60A5FA", "#38BDF8", "#34D399"];
  const maxValue = Math.max(...data.map((s) => s.value), 1);
  const stages = data.map((s, i) => ({
    label: s.label,
    count: s.count,
    value: `$${Math.round(s.value).toLocaleString("en-US")}`,
    color: STAGE_COLORS[i % STAGE_COLORS.length],
    widthPct: Math.round((s.value / maxValue) * 100),
  }));

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Sales Pipeline</h5>
          <p className="text-xs text-slate-500 dark:text-white/90 font-medium">Opportunities by Stage</p>
        </div>
        <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View Pipeline <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-3 py-1">
        {stages.length === 0 ? (
          <EmptyChartState label="No open opportunities in your pipeline yet." actionLabel="Add Opportunity" onAction={onOpen} />
        ) : stages.map((stage) => (
          <div
            key={stage.label}
            onClick={onOpen}
            className="space-y-1 cursor-pointer p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
          >
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-800 dark:text-white font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{stage.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-slate-600 dark:text-white font-semibold">{stage.count}</span>
                <span className="text-slate-900 dark:text-white font-bold">{stage.value}</span>
              </div>
            </div>
            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full group-hover:opacity-90 transition-opacity" style={{ background: stage.color, width: `${stage.widthPct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Revenue Projection line chart */
function RevenueProjectionCard({
  projection,
  wonTrend,
  mounted,
  onOpen,
}: {
  projection: { weekly: { month: string; value: number; count: number }[]; monthly: { month: string; value: number; count: number }[]; yearly: { month: string; value: number; count: number }[] };
  wonTrend: { weekly: { month: string; value: number; count: number }[]; monthly: { month: string; value: number; count: number }[]; yearly: { month: string; value: number; count: number }[] };
  mounted: boolean;
  onOpen: () => void;
}) {
  const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const projPoints = projection[period] || [];
  const wonPoints = wonTrend[period] || [];

  // Use the first 6 periods for a clean, spacious, uncluttered responsive timeline
  const activePoints = projPoints.slice(0, 6);
  const data = activePoints.map((p, idx) => ({
    month: p.month,
    shortMonth: p.month.split(" ")[0],
    expected: p.value,
    closed: wonPoints[idx]?.value ?? 0,
  }));
  const hasData = data.some((d) => d.expected > 0 || d.closed > 0);

  // data-tour-id below anchors DASHBOARD_TOUR_STEPS[1] — see the note on the
  // dashboard <h1>. This card is user-rearrangeable, so when the widget is not
  // on the board the overlay skips that step rather than stalling on it.
  return (
    <Card data-tour-id="dashboard-revenue-chart" className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div>
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Revenue Projection</h5>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-[var(--muted)] p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className={
                  "px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors " +
                  (period === opt.key
                    ? "bg-white dark:bg-[#1b212e] text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0">
            Forecast <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
          <span className="text-slate-600 dark:text-white font-medium text-[11px]">Expected (Open)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#10B981]" />
          <span className="text-slate-600 dark:text-white font-medium text-[11px]">Closed (Won)</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0">
        {!mounted ? null : !hasData ? (
          <EmptyChartState label="No opportunities with expected close dates yet." actionLabel="View Opportunities" onAction={onOpen} />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="shortMonth" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}K` : v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                formatter={(v) => [`$${Number(v).toLocaleString("en-US")}`, ""]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month || ""}
              />
              <Line type="monotone" dataKey="expected" name="Expected" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="closed" name="Closed" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

/** Recent opportunities table */
function RecentOpportunitiesCard({
  data,
  onOpen,
}: {
  data: RecentDealRow[];
  onOpen: () => void;
}) {
  const rows = data && data.length > 0 ? data : [];

  const STAGE_NAME_MAP: Record<string, string> = {
    new: "New",
    qualification: "Qualification",
    qualified: "Qualified",
    meeting_scheduled: "Meeting",
    proposal_sent: "Proposal",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost",
  };

  const STAGE_BADGE_STYLES: Record<string, string> = {
    won: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
    lost: "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50",
    negotiation: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    proposal_sent: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50",
    qualified: "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
    meeting_scheduled: "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50",
    new: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  };

  if (rows.length === 0) {
    return (
      <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" />
            <h5 className="text-base font-bold text-slate-900 dark:text-white">Recent Opportunities</h5>
          </div>
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            View All <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0">
          <EmptyChartState label="No opportunities yet." actionLabel="Add Opportunity" onAction={onOpen} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-indigo-500" />
          <h5 className="text-base font-bold text-slate-900 dark:text-white">Recent Opportunities</h5>
        </div>
        <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0">
          View All <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-2 overflow-y-auto pr-0.5">
        {rows.slice(0, 4).map((r) => (
          <div
            key={r.id}
            onClick={onOpen}
            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate transition-colors">
                {r.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-300 truncate">
                <span>{r.contact_name || "Unassigned"}</span>
                {r.expected_close_date && (
                  <>
                    <span>·</span>
                    <span>{new Date(r.expected_close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 gap-1">
              <span className="text-xs font-bold text-slate-900 dark:text-white">{money(r.deal_value)}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                STAGE_BADGE_STYLES[r.stage] || "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50"
              }`}>
                {STAGE_NAME_MAP[r.stage] || r.stage}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}


const DEAL_STAGE_COLOR: Record<string, string> = {
  won: "#10B981", lost: "#F43F5E", negotiation: "#F59E0B",
  proposal_sent: "#6366F1", meeting_scheduled: "#6366F1", qualified: "#6366F1", new: "#94A3B8",
};

/** Your most recently created deals, real rows straight from `opportunities`
 *  (name, stage, value, contact) — the one place on this dashboard where you
 *  see individual deals rather than aggregates. */
interface RecentDealRow {
  id: string;
  name: string;
  stage: string;
  deal_value: number;
  contact_name: string | null;
  expected_close_date?: string | null;
}

function RecentDealsCard({ data, emptyLabel, onOpen }: { data: RecentDealRow[]; emptyLabel: string; onOpen: () => void }) {
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-base font-bold text-slate-900 dark:text-white">Recent deals</h5>
        <button onClick={onOpen} className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 min-h-0"><EmptyChartState label={emptyLabel} /></div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overflow-x-hidden pr-0.5">
          {data.map((d) => (
            <button
              key={d.id}
              onClick={onOpen}
              className="w-full flex items-center gap-3 py-2 px-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: DEAL_STAGE_COLOR[d.stage] ?? "#94A3B8" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{d.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{STAGE_LABELS[d.stage as keyof typeof STAGE_LABELS] ?? d.stage}{d.contact_name ? ` · ${d.contact_name}` : ""}</p>
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white shrink-0 text-right">{money(d.deal_value)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

interface SetupTask {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  done: boolean;
}

/** Derives the workspace's real setup-completion state — every task's
 *  `done` comes straight from a live signal (a connected mailbox row, an
 *  actual lead in the table, a teammate who's joined, a campaign that's
 *  actually been sent), so a task simply stops being returned once it's
 *  genuinely finished. There is no dismiss button and nothing is persisted
 *  client-side: unlike AiInsightsCard/RecommendationsCard's performance
 *  suggestions, these represent one-time account setup, not ongoing advice,
 *  so "completed" has to mean actually completed. */
function buildSetupTasks(
  onboardingStatus: OnboardingStatus | undefined,
  totalLeads: number,
  collaboratorCount: number,
  emailsSent: number,
  go: (href: string) => void
): SetupTask[] {
  return [
    {
      id: "connect-email",
      title: "Connect your email",
      description: "Connect Gmail or Outlook to send and track outreach directly from Nxelio.",
      actionLabel: "Connect",
      // Settings reads ?section= on mount (settings-view.tsx) and opens that
      // panel directly, so these land on the exact connector rather than
      // dropping someone on the Profile tab to go hunting.
      onAction: () => go("/settings?section=email"),
      done: Boolean(onboardingStatus?.inboxConnected),
    },
    {
      id: "connect-linkedin",
      title: "Connect your LinkedIn",
      description: "Link LinkedIn to send connection requests and messages alongside email.",
      actionLabel: "Connect",
      onAction: () => go("/settings?section=linkedin"),
      done: Boolean(onboardingStatus?.linkedinConnected),
    },
    {
      id: "connect-calendar",
      title: "Connect your calendar",
      description: "Sync your calendar so meetings booked with leads show up automatically.",
      actionLabel: "Connect",
      onAction: () => go("/settings?section=calendar"),
      done: Boolean(onboardingStatus?.calendarConnected),
    },
    {
      id: "import-leads",
      title: "Import your leads",
      description: "Add or import your first leads to start building your pipeline.",
      actionLabel: "Import",
      onAction: () => go("/leads"),
      done: totalLeads > 0,
    },
    {
      id: "invite-team",
      title: "Invite your team",
      description: "Add teammates so you can share leads and win deals together.",
      actionLabel: "Invite",
      // Teammates live on /users, not in Settings — this previously sent
      // people to the Settings page, which has no invite anywhere on it.
      onAction: () => go("/users"),
      done: collaboratorCount > 1,
    },
    {
      id: "first-campaign",
      title: "Send your first campaign",
      description: "Launch an email campaign to start nurturing leads automatically.",
      actionLabel: "Create",
      // Straight into the builder — the same place the Campaigns page's own
      // "New Campaign" button goes.
      onAction: () => go("/campaigns/builder"),
      done: emailsSent > 0,
    },
  ].filter((task) => !task.done);
}

/** Fixed, non-removable setup checklist shown only while onboarding tasks
 *  remain — unlike dashboard widgets, this isn't part of the customizable
 *  "Edit layout" system, since it's account setup rather than a business
 *  metric someone would want to arrange or resize. Once every task is
 *  actually complete the whole card disappears.
 *
 *  Each row can also be cleared by hand: ✓ marks it done (the person handled
 *  it, possibly outside Nxelio), ✕ dismisses the suggestion. Both persist per
 *  workspace via setup-tasks.ts, and both hide the row optimistically so the
 *  click feels instant — reverting only if the write actually fails. */
function TodaysPrioritiesBanner({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (href: string) => void }) {
  const priorities = stats.todaysPriorities ?? {
    followUpCount: 0,
    highIntentTodayCount: 0,
    readyToConvertCount: 0,
    meetingsCount: 0,
  };

  return (
    <Card className="bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
      {/* Left indicator */}
      <div className="flex items-center gap-3.5 shrink-0 xl:pr-4 xl:border-r border-slate-100 dark:border-slate-800/80">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/25">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Today&apos;s Priorities</h4>
          <p className="text-xs text-slate-500 dark:text-white font-medium mt-0.5">4 important actions to keep your pipeline moving.</p>
        </div>
      </div>

      {/* 4 actionable item cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
        {/* Item 1: Follow up */}
        <button
          onClick={() => onNavigate("/leads")}
          className="flex items-center justify-between p-3.5 rounded-xl border border-rose-200/60 dark:border-rose-900/30 bg-gradient-to-br from-rose-50/40 via-white to-white dark:from-rose-950/20 dark:via-[#1b212e] dark:to-[#1b212e] hover:border-rose-300 dark:hover:border-rose-800/60 shadow-2xs transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/25">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 dark:text-white leading-none">{priorities.followUpCount}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-white truncate mt-1">Leads need follow-up</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-200 group-hover:text-slate-700 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
        </button>

        {/* Item 2: High intent */}
        <button
          onClick={() => onNavigate("/leads?status=Hot")}
          className="flex items-center justify-between p-3.5 rounded-xl border border-amber-200/60 dark:border-amber-900/30 bg-gradient-to-br from-amber-50/40 via-white to-white dark:from-amber-950/20 dark:via-[#1b212e] dark:to-[#1b212e] hover:border-amber-300 dark:hover:border-amber-800/60 shadow-2xs transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/25">
              <Flame className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 dark:text-white leading-none">{priorities.highIntentTodayCount}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-white truncate mt-1">High intent leads today</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-200 group-hover:text-slate-700 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
        </button>

        {/* Item 3: Qualified leads */}
        <button
          onClick={() => onNavigate("/leads?status=Qualified")}
          className="flex items-center justify-between p-3.5 rounded-xl border border-blue-200/60 dark:border-blue-900/30 bg-gradient-to-br from-blue-50/40 via-white to-white dark:from-blue-950/20 dark:via-[#1b212e] dark:to-[#1b212e] hover:border-blue-300 dark:hover:border-blue-800/60 shadow-2xs transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/25">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 dark:text-white leading-none">{priorities.readyToConvertCount}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-white truncate mt-1">Qualified leads ready to convert</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-200 group-hover:text-slate-700 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
        </button>

        {/* Item 4: Meeting */}
        <button
          onClick={() => onNavigate("/meetings")}
          className="flex items-center justify-between p-3.5 rounded-xl border border-purple-200/60 dark:border-purple-900/30 bg-gradient-to-br from-purple-50/40 via-white to-white dark:from-purple-950/20 dark:via-[#1b212e] dark:to-[#1b212e] hover:border-purple-300 dark:hover:border-purple-800/60 shadow-2xs transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-purple-600 to-violet-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-500/25">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 dark:text-white leading-none">{priorities.meetingsCount}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-white truncate mt-1">Meeting to prepare for</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-200 group-hover:text-slate-700 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
        </button>
      </div>
    </Card>
  );
}

/** Fixed setup checklist or Today's Priorities once complete */
function SetupChecklistCard({
  tasks,
  initialStates,
  stats,
  onNavigate,
}: {
  tasks: SetupTask[];
  initialStates: Record<string, "accepted" | "dismissed">;
  stats: DashboardStats;
  onNavigate: (href: string) => void;
}) {
  const { toast } = useFeedback();
  const [clearedIds, setClearedIds] = useState<string[]>(() => Object.keys(initialStates));
  const [pendingId, setPendingId] = useState<string | null>(null);

  const visible = tasks.filter((t) => !clearedIds.includes(t.id));
  if (visible.length === 0) {
    return <TodaysPrioritiesBanner stats={stats} onNavigate={onNavigate} />;
  }

  async function clearTask(taskId: string, action: "complete" | "dismiss") {
    setPendingId(taskId);
    setClearedIds((ids) => [...ids, taskId]);
    const ok = action === "complete" ? await completeSetupTask(taskId) : await dismissSetupTask(taskId);
    setPendingId(null);
    if (!ok) {
      setClearedIds((ids) => ids.filter((id) => id !== taskId));
      toast("Couldn't update that setup step — please try again.", "error");
      return;
    }
    toast(action === "complete" ? "Marked as completed." : "Recommendation dismissed.", "success");
  }

  return (
    <Card className="bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-indigo-500" />
          <h5 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Finish setting up your workspace</h5>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
          {visible.length} step{visible.length === 1 ? "" : "s"} left
        </span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="text-left text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wide">
              <th className="px-3 py-2 font-semibold">Task</th>
              <th className="px-3 py-2 font-semibold hidden md:table-cell">Description</th>
              <th className="px-3 py-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((task) => (
              <tr key={task.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">{task.title}</td>
                <td className="px-3 py-3 text-slate-500 hidden md:table-cell max-w-xs">{task.description}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={task.onAction}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {task.actionLabel}
                    </button>
                    <button
                      onClick={() => clearTask(task.id, "complete")}
                      disabled={pendingId === task.id}
                      title="Mark as completed"
                      aria-label={`Mark "${task.title}" as completed`}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 dark:hover:border-emerald-800 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => clearTask(task.id, "dismiss")}
                      disabled={pendingId === task.id}
                      title="Dismiss"
                      aria-label={`Dismiss "${task.title}"`}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:border-rose-800 transition-colors disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Actionable Nxelio AI Intelligence Card */
function AiInsightsCard({
  stats,
  onOpenProspects,
  onOpenDeals,
  onOpenCampaigns,
}: {
  stats: DashboardStats;
  onOpenProspects: () => void;
  onOpenDeals: () => void;
  onOpenCampaigns: () => void;
}) {
  const summary = buildAiDashboardSummary(stats);
  const keyInsights = stats.actionableAiInsights?.items || summary.keyInsights;

  return (
    <Card className="bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-2xs">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <h5 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Nxelio AI Intelligence
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
                Live
              </span>
            </h5>
          </div>
          <button
            onClick={onOpenProspects}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            View Insights <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="py-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Key Insights for You
          </div>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-white">
            {keyInsights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-indigo-500 dark:text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                <span className="text-slate-700 dark:text-white font-medium">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={onOpenCampaigns}
          className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-95 text-white font-semibold text-xs transition-all shadow-sm shadow-indigo-500/25 text-center truncate"
        >
          Follow-up Emails
        </button>
        <button
          onClick={onOpenProspects}
          className="w-full py-2 px-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold text-xs transition-colors text-center shadow-2xs truncate"
        >
          Recommended Leads
        </button>
      </div>
    </Card>
  );
}

const SPAN_CLASS: Record<WidgetSize, string> = {
  3: "col-span-1 sm:col-span-1 md:col-span-3 lg:col-span-6 xl:col-span-3",
  4: "col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-6 xl:col-span-4",
  6: "col-span-1 sm:col-span-2 md:col-span-6 lg:col-span-6 xl:col-span-6",
  8: "col-span-1 sm:col-span-2 md:col-span-6 lg:col-span-12 xl:col-span-8",
  12: "col-span-1 sm:col-span-2 md:col-span-6 lg:col-span-12 xl:col-span-12",
};

/** One widget's slot in the dashboard grid — a dnd-kit sortable item that
 *  becomes draggable (grip handle) and removable (X) only in edit mode, so
 *  the normal view stays exactly as plain as before this feature existed. */
function SortableWidgetItem({
  id, size, editing, onRemove, onResize, children,
}: {
  id: WidgetKey; size: WidgetSize; editing: boolean; onRemove: () => void; onResize: (size: WidgetSize) => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    setNodeRef(node);
  };
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [resizing, setResizing] = useState(false);

  function startResize(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = localRef.current;
    if (!el) return;
    const startX = e.clientX;
    const pxPerCol = el.getBoundingClientRect().width / size;
    let lastSize = size;
    setResizing(true);
    function onMove(ev: PointerEvent) {
      const deltaCols = Math.round((ev.clientX - startX) / pxPerCol);
      const next = clampWidgetSize(size + deltaCols);
      if (next !== lastSize) {
        lastSize = next;
        onResize(next);
      }
    }
    function onUp() {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={setRefs} style={style} className={`${SPAN_CLASS[size]} relative`}>
      {editing && (
        <>
          <div className="absolute -top-2 -right-2 z-10 flex gap-1">
            <button
              {...attributes} {...listeners}
              className="p-1.5 rounded-full bg-slate-800 text-white shadow-lg cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reorder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
              title="Remove widget"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onPointerDown={startResize}
            title="Drag to resize"
            className={`hidden lg:flex absolute -bottom-2 -right-2 z-10 p-1.5 rounded-full text-white shadow-lg cursor-nwse-resize touch-none transition-colors ${
              resizing ? "bg-slate-950" : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <div className={editing ? "ring-2 ring-dashed ring-slate-300 dark:ring-slate-700 rounded-2xl" : ""}>
        {children}
      </div>
    </div>
  );
}

const PLAN_NAME: Record<string, string> = { basic: "Basic", starter: "Starter", pro: "Pro" };

// Welcome banner (shown once after checkout completes)
function WelcomeBanner({ planId = "basic" }: { planId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // Lazy initializers run once during render, not as a setState-in-effect —
  // `visible`/`wasTrial` must be captured once from the URL, not derived
  // live from params, since router.replace() below strips "welcome" from
  // the URL and would otherwise hide the banner immediately instead of
  // after the 3s timer.
  const [visible, setVisible] = useState(() => params.get("welcome") === "1");
  const [wasTrial] = useState(() => params.get("trial") === "1");

  useEffect(() => {
    if (!visible) return;
    router.replace("/dashboard", { scroll: false });

    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [visible, router]);

  if (!visible) return null;

  const planName = PLAN_NAME[planId] ?? "Starter";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={() => setVisible(false)}
      />

      {/* Modal Content */}
      <div
        role="dialog"
        aria-modal="true"
        style={{ animation: "lp-toast-in 0.25s ease-out" }}
        className="relative w-full max-w-sm rounded-2xl border border-slate-150 bg-white dark:bg-slate-900 p-6 shadow-2xl text-center flex flex-col items-center"
      >
        {/* Animated Success Checkmark / Confetti style */}
        <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-100 dark:border-emerald-500/20">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-bounce" />
        </div>

        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          Congratulations!
        </h3>

        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          You purchased the <span className="font-semibold text-slate-800 dark:text-slate-200">{planName}</span> plan.
        </p>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          {wasTrial ? "Your trial is active. Explore all features below." : "Your subscription is active. Explore all features below."}
        </p>

        <button
          onClick={() => setVisible(false)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface OnboardingStatus {
  essentialsDone: boolean;
  inboxConnected: boolean;
  linkedinConnected: boolean;
  calendarConnected: boolean;
  goals: string[];
  userName: string;
}

interface UsageHistoryEntry {
  id: string;
  operation_type: string;
  credits_delta: number;
  resource_type: "credits" | "leads";
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// PLAN_NAME was moved up to be available in WelcomeBanner

export function DashboardView({
  stats,
  userName = "User",
  onboardingStatus,
  collaborators = [],
  credits = { used: 0, total: 400, planId: "basic", status: "trialing", trialEndsAt: null, leadsRemaining: 0, leadsTotal: 0 },
  usageHistory = [],
  teamPerformance = [],
  recentDeals = [],
  setupTaskStates = {},
  savedLayouts = [],
  activeLayoutId = null,
  activeLayoutWidgets = null,
}: {
  stats: DashboardStats;
  userName?: string;
  onboardingStatus?: OnboardingStatus;
  collaborators?: { name: string }[];
  credits?: AiCreditsUsage;
  usageHistory?: UsageHistoryEntry[];
  teamPerformance?: { name: string; dealsCount: number; wonValue: number }[];
  recentDeals?: RecentDealRow[];
  setupTaskStates?: Record<string, "accepted" | "dismissed">;
  savedLayouts?: DashboardLayout[];
  activeLayoutId?: string | null;
  activeLayoutWidgets?: LayoutWidget[] | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  usePageTour("dashboard", DASHBOARD_TOUR_STEPS);
  const accent = useThemeAccent();
  const TILE_PURPLE = "#8B7FF0";
  const TILE_BLUE = "#3E8EDE";
  const TILE_GREEN = "#2FB88A";

  // A time-of-day greeting genuinely needs the visitor's LOCAL hour, but
  // reading it during the initial render risks a server/client hydration
  // mismatch: Next.js server-renders this "use client" component too, and
  // the server's clock (often a different timezone entirely) can land on a
  // different greeting than the browser's for the same real moment. Render
  // a neutral default on the first pass, then swap to the real local
  // greeting once mounted on the client — matching what the server already
  // sent, so hydration never disagrees with itself.
  const [greeting, setGreeting] = useState("Welcome back");
  // Same hydration hazard as the greeting above — the weekday/date badge
  // also needs the visitor's real local date, not a server-computed one.
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  useEffect(() => {
    const hour = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time swap from the neutral SSR default to the real local greeting/date once mounted, avoiding a server/client hydration mismatch
    setGreeting(hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening");
    setDateLabel(new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }));
  }, []);

  // Recharts' ResponsiveContainer measures its parent's real pixel size via
  // ResizeObserver, which isn't available yet during SSR/first paint — that
  // mismatch is what throws the "width(-1) and height(-1)" console warnings.
  // Deferring the chart's first render to after mount sidesteps it entirely.
  const [chartsMounted, setChartsMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-mounted flag, needed to defer chart measurement past first paint (see comment above)
    setChartsMounted(true);
  }, []);

  // ── Customizable layout (Edit layout / widget library / saved layouts) ──
  const [layouts, setLayouts] = useState(savedLayouts);
  const [currentLayoutId, setCurrentLayoutId] = useState(activeLayoutId);
  const currentSavedLayout = layouts.find((l) => l.id === currentLayoutId) ?? null;
  const savedWidgets = currentSavedLayout?.widgets ?? activeLayoutWidgets;
  const [layout, setLayout] = useState<LayoutWidget[]>(savedWidgets && savedWidgets.length ? savedWidgets : DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [draftLayout, setDraftLayout] = useState<LayoutWidget[]>(layout);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renamingName, setRenamingName] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    if (switcherOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  function beginEdit() {
    setDraftLayout(layout);
    setRenamingName(currentSavedLayout?.name ?? "");
    setEditing(true);
    setLibraryOpen(true);
  }
  function cancelEdit() {
    setEditing(false);
    setLibraryOpen(false);
  }
  async function saveEdit(asNew: boolean) {
    setSaving(true);
    try {
      if (asNew || !currentSavedLayout) {
        const name = renamingName.trim() || "My layout";
        const created = await createDashboardLayout(name, draftLayout);
        if (!created) { toast("Couldn't save this layout — please try again.", "error"); return; }
        await setActiveDashboardLayout(created.id);
        setLayouts((prev) => [{ id: created.id, name, widgets: draftLayout, isStarred: false, updatedAt: new Date().toISOString() }, ...prev]);
        setCurrentLayoutId(created.id);
      } else {
        const ok = await updateDashboardLayout(currentSavedLayout.id, { widgets: draftLayout, name: renamingName.trim() || currentSavedLayout.name });
        if (!ok) { toast("Couldn't save changes to this layout.", "error"); return; }
        setLayouts((prev) => prev.map((l) => (l.id === currentSavedLayout.id ? { ...l, widgets: draftLayout, name: renamingName.trim() || l.name } : l)));
      }
      setLayout(draftLayout);
      setEditing(false);
      setLibraryOpen(false);
      toast("Layout saved.", "success");
    } finally {
      setSaving(false);
    }
  }
  async function switchLayout(id: string | null) {
    setSwitcherOpen(false);
    const ok = await setActiveDashboardLayout(id);
    if (!ok) { toast("Couldn't switch layouts — please try again.", "error"); return; }
    setCurrentLayoutId(id);
    const next = id ? layouts.find((l) => l.id === id)?.widgets : DEFAULT_LAYOUT;
    setLayout(next && next.length ? next : DEFAULT_LAYOUT);
  }
  async function deleteLayout(id: string) {
    const ok = await deleteDashboardLayout(id);
    if (!ok) { toast("Couldn't delete this layout.", "error"); return; }
    setLayouts((prev) => prev.filter((l) => l.id !== id));
    if (currentLayoutId === id) { setCurrentLayoutId(null); setLayout(DEFAULT_LAYOUT); }
  }
  async function toggleStar(id: string) {
    const target = layouts.find((l) => l.id === id);
    if (!target) return;
    const ok = await updateDashboardLayout(id, { isStarred: !target.isStarred });
    if (ok) setLayouts((prev) => prev.map((l) => (l.id === id ? { ...l, isStarred: !l.isStarred } : l)));
  }

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraftLayout((prev) => {
      const oldIndex = prev.findIndex((w) => w.key === active.id);
      const newIndex = prev.findIndex((w) => w.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }
  function addWidget(key: WidgetKey) {
    setDraftLayout((prev) => (prev.some((w) => w.key === key) ? prev : [...prev, { key, size: WIDGET_SIZES[key] }]));
  }
  function removeWidget(key: WidgetKey) {
    setDraftLayout((prev) => prev.filter((w) => w.key !== key));
  }
  function resizeWidget(key: WidgetKey, size: WidgetSize) {
    setDraftLayout((prev) => prev.map((w) => (w.key === key ? { ...w, size } : w)));
  }

  const stageFunnelData = stats.stageFunnel.map((s, idx) => ({
    name: s.label, value: s.count, color: DONUT_COLORS[idx % DONUT_COLORS.length],
  }));
  // Semantic colors here (green = won, red = lost) rather than palette order.
  const dealOutcomeData = [
    { name: "Won", value: stats.dealsOverview.successfulCount, color: "#10B981" },
    { name: "Open", value: stats.dealsOverview.pendingCount, color: "#6366F1" },
    { name: "Lost", value: stats.dealsOverview.rejectedCount, color: "#F43F5E" },
  ].filter((d) => d.value > 0);

  // Maps a widget key to its JSX — the single place every widget on this
  // dashboard is rendered from, whether it's in the fixed System layout or
  // a saved custom one. Keeping this a plain switch (not a component-per-key
  // registry) means every widget still closes over the same live stats/
  // theme/mounted state above instead of re-deriving it.
  function renderWidget(key: WidgetKey): ReactNode {
    switch (key) {
      case "ai_insights": return (
        <AiInsightsCard
          stats={stats}
          onOpenProspects={() => router.push("/leads")}
          onOpenDeals={() => router.push("/opportunities")}
          onOpenCampaigns={() => router.push("/campaigns")}
        />
      );
      case "total_leads": return (
        <ModernStatTile
          label="Total leads"
          value={formatStat(stats.totalLeads)}
          sublabel="vs last 30 days"
          accentColor="blue"
          icon={<Users className="h-4 w-4" />}
          trendPct={stats.leadsDelta}
          onClick={() => router.push("/leads")}
        />
      );
      case "engagement_rate": return (
        <ModernStatTile
          label="Engagement rate"
          value={`${stats.engagementRate}%`}
          sublabel="vs last 30 days"
          accentColor="emerald"
          icon={<Play className="h-4 w-4" />}
          trendPct={stats.engagementTrendPct}
          onClick={() => router.push("/campaigns")}
        />
      );
      case "lead_conversion_rate": return (
        <ModernStatTile
          label="Lead conversion rate"
          value={`${stats.conversionRate}%`}
          sublabel="vs last 30 days"
          accentColor="indigo"
          icon={<Filter className="h-4 w-4" />}
          trendPct={stats.conversionTrendPct}
          onClick={() => router.push("/leads?filter=qualified")}
        />
      );
      case "avg_days_to_qualify": return (
        <ModernStatTile
          label="Avg days to qualify"
          value={stats.avgDaysToQualify !== null ? stats.avgDaysToQualify.toString() : "18"}
          sublabel="vs last 30 days"
          accentColor="purple"
          icon={<CalendarClock className="h-4 w-4" />}
          trendPct={stats.daysToQualifyTrendPct}
          onClick={() => router.push("/leads")}
        />
      );
      case "qualified_leads": return (
        <ModernStatTile
          label="Qualified leads"
          value={formatStat(stats.qualifiedLeads)}
          sublabel="vs last 30 days"
          accentColor="amber"
          icon={<Target className="h-4 w-4" />}
          trendPct={stats.qualifiedLeadsTrendPct}
          onClick={() => router.push("/leads?filter=qualified")}
        />
      );
      case "hot_leads_kpi": return (
        <ModernStatTile
          label="Hot leads"
          value={formatStat(stats.hotLeads)}
          sublabel="vs last 30 days"
          accentColor="rose"
          icon={<Flame className="h-4 w-4" />}
          trendPct={stats.hotLeadsTrendPct}
          onClick={() => router.push("/leads?filter=hot")}
        />
      );
      case "qualified_pipeline_value": return (
        <ModernStatTile
          label="Qualified pipeline value"
          value={money(stats.qualifiedPipelineValue)}
          sublabel="vs last 30 days"
          accentColor="blue"
          icon={<Layers className="h-4 w-4" />}
          trendPct={stats.qualifiedPipelineTrendPct}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "avg_lead_age": return (
        <ModernStatTile
          label="Avg lead age"
          value={stats.avgLeadAge !== null ? stats.avgLeadAge.toString() : "24"}
          sublabel="vs last 30 days"
          accentColor="cyan"
          icon={<Calendar className="h-4 w-4" />}
          trendPct={stats.leadAgeTrendPct}
          onClick={() => router.push("/leads")}
        />
      );
      case "lead_funnel": return (
        <LeadFunnelCard
          data={stats.leadFunnel}
          onOpen={() => router.push("/leads")}
        />
      );
      case "total_sales": return (
        <ModernStatTile
          label="Total sales"
          value={money(stats.pipeline.wonValue)}
          sublabel="All-time won revenue"
          variant="hero"
          icon={<Zap className="h-4 w-4" />}
          trendPct={stats.revenueTrendPct}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "win_rate": return (
        <ModernStatTile
          label="Win rate"
          value={`${stats.pipeline.winRate}%`}
          sublabel="Won ÷ closed deals"
          accentColor="purple"
          icon={<Target className="h-4 w-4" />}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "close_rate": return (
        <ModernStatTile
          label="Close rate"
          value={`${stats.conversionRate}%`}
          sublabel="Leads converted"
          accentColor="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
          trendPct={stats.conversionTrendPct}
          onClick={() => router.push("/leads")}
        />
      );
      case "avg_days_to_close": return (
        <ModernStatTile
          label="Avg days to close"
          value={stats.avgDaysToClose !== null ? stats.avgDaysToClose.toString() : "—"}
          sublabel="Won deals, all-time"
          accentColor="cyan"
          icon={<CalendarClock className="h-4 w-4" />}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "pipeline_value": return (
        <ModernStatTile
          label="Pipeline value"
          value={money(stats.pipeline.openValue)}
          sublabel="Open deals"
          accentColor="indigo"
          icon={<Layers className="h-4 w-4" />}
          trendPct={stats.pipelineValueTrendPct}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "open_deals": return (
        <ModernStatTile
          label="Open deals"
          value={formatStat(stats.pipeline.openCount)}
          sublabel="Currently active"
          accentColor="blue"
          icon={<Users className="h-4 w-4" />}
          trendPct={stats.dealsCreatedTrendPct}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "weighted_value": return (
        <ModernStatTile
          label="Weighted value"
          value={money(stats.weightedPipelineValue)}
          sublabel="Stage-likelihood estimate"
          accentColor="amber"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "avg_open_deal_age": return (
        <ModernStatTile
          label="Avg open deal age"
          value={stats.avgOpenDealAge !== null ? stats.avgOpenDealAge.toString() : "—"}
          sublabel="Days since created"
          accentColor="emerald"
          icon={<Gauge className="h-4 w-4" />}
          onClick={() => router.push("/opportunities")}
        />
      );
      case "won_deals_trend": return (
        <DualLineTrendCard
          title="Won deals (last 12 months)"
          subtitle="Closed value vs. number of deals won, by month"
          data={stats.wonDealsTrend}
          moneyKey="Closed value"
          countKey="Won deals"
          lineColor={DONUT_COLORS[0]}
          lineColorSoft={DONUT_COLORS[1]}
          emptyLabel="No deals won in the last 12 months yet."
          mounted={chartsMounted}
          actionLabel="View Opportunities"
          onOpen={() => router.push("/opportunities")}
        />
      );
      case "deals_projection": return (
        <RevenueProjectionCard
          projection={stats.dealsProjection}
          wonTrend={stats.wonDealsTrend}
          mounted={chartsMounted}
          onOpen={() => router.push("/analytics/revenue")}
        />
      );
      case "sales_pipeline": return (
        <SalesPipelineStageCard
          data={stats.pipelineBuckets}
          onOpen={() => router.push("/opportunities")}
        />
      );
      case "deal_outcomes": return (
        <DealOutcomesDonutCard title="Deal outcomes" data={dealOutcomeData} mounted={chartsMounted} emptyLabel="No closed deals yet." onOpen={() => router.push("/opportunities")} />
      );
      case "team_performance": return (
        <TeamPerformanceBarCard
          data={teamPerformance}
          mounted={chartsMounted}
          emptyLabel="No deals assigned to a teammate yet."
          onOpen={() => router.push("/analytics/team")}
        />
      );
      case "lead_growth": return (
        <LeadGrowthCard
          data={stats.leadGrowth}
          groupedData={stats.leadGrowthGrouped}
          mounted={chartsMounted}
          emptyLabel="No new leads in the last few months yet."
          onOpen={() => router.push("/leads")}
        />
      );
      case "hot_leads":
      case "hot_lead_alerts": return (
        <HotLeadAlertsCard
          alertsList={stats.hotLeadAlertsList}
          data={stats.hotLeadAlerts}
          emptyLabel="No hot leads right now."
          onOpen={() => router.push("/leads?filter=hot")}
        />
      );
      case "recent_activity": return (
        <RecentActivityCard
          data={stats.recentActivities}
          emptyLabel="No recent activity yet."
          onOpen={() => router.push("/activities")}
        />
      );
      case "campaign_performance": return (
        <CampaignPerformanceCard
          campaignsTable={stats.campaignsTable}
          data={stats.campaignPerf}
          mounted={chartsMounted}
          emptyLabel="No campaigns with activity yet."
          onOpen={() => router.push("/campaigns")}
        />
      );
      case "lead_sources": return (
        <LeadSourcesCard
          data={stats.trafficSources}
          totalLeads={stats.totalLeads}
          mounted={chartsMounted}
          emptyLabel="No leads with a known source yet."
          onOpen={() => router.push("/analytics/prospects")}
        />
      );
      case "recent_deals": return (
        <RecentOpportunitiesCard data={recentDeals} onOpen={() => router.push("/opportunities")} />
      );
      default: return null;
    }
  }

  // Get first name for greeting
  const firstName = userName.split(" ")[0];

  const setupTasks = buildSetupTasks(
    onboardingStatus,
    stats.totalLeads,
    collaborators.length,
    stats.snapshot.emailsSent,
    (href) => router.push(href)
  );

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-10 px-4 sm:px-6 text-slate-800 dark:text-slate-200">

      {/* Welcome Banner */}
      <Suspense fallback={null}>
        <WelcomeBanner planId={credits?.planId} />
      </Suspense>

      {/* In-page header — greeting + live date */}
      <div className="rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#1b212e] border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white">
              {dateLabel ?? " "}
            </span>
          </div>
          {/* data-tour-id anchors DASHBOARD_TOUR_STEPS[0]; the overlay renders
              nothing at all for a step whose target is absent, so removing this
              silently kills the whole dashboard tour. */}
          <h1 data-tour-id="dashboard-welcome" className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {greeting}, {firstName}! 👋
          </h1>
          <p className="text-xs text-slate-500 dark:text-white font-medium mt-0.5">Here&apos;s what&apos;s happening with your leads today.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 text-xs font-medium text-indigo-900 dark:text-white shadow-2xs">
          <span className="italic font-semibold text-indigo-950 dark:text-white">&ldquo;Nurture today. Revenue tomorrow.&rdquo;</span>
          <span className="text-[11px] text-indigo-500 dark:text-indigo-300 font-bold">— Nxelio</span>
        </div>
      </div>

      {/* Setup checklist — fixed, not part of the customizable layout; only
          renders while real setup tasks remain (see SetupChecklistCard) */}
      <SetupChecklistCard
        tasks={setupTasks}
        initialStates={setupTaskStates}
        stats={stats}
        onNavigate={(href) => router.push(href)}
      />

      {/* Layout controls — hidden while editing, since Save/Cancel below take over */}
      {!editing && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={beginEdit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-200 dark:hover:text-white"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit layout
          </button>
          <div className="relative" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b212e] text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {currentSavedLayout?.name ?? "Overview"} <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {switcherOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b212e] shadow-lg z-30 py-1.5">
                <button
                  onClick={() => switchLayout(null)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5 ${currentLayoutId === null ? "text-slate-900 dark:text-white font-bold" : "text-slate-600 dark:text-slate-100"}`}
                >
                  Overview (default)
                  {currentLayoutId === null && <span style={{ color: accent }}>●</span>}
                </button>
                {layouts.length > 0 && (
                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Your layouts</div>
                )}
                {[...layouts].sort((a, b) => Number(b.isStarred) - Number(a.isStarred)).map((l) => (
                  <div key={l.id} className="group flex items-center px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
                    <button onClick={() => switchLayout(l.id)} className={`flex-1 text-left text-xs font-medium truncate ${currentLayoutId === l.id ? "text-slate-900 dark:text-white font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                      {l.name}
                    </button>
                    <button onClick={() => toggleStar(l.id)} className="p-0.5 shrink-0" title={l.isStarred ? "Unstar" : "Star"}>
                      <Star className={`h-3.5 w-3.5 ${l.isStarred ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
                    </button>
                    <button onClick={() => deleteLayout(l.id)} className="p-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500" title="Delete layout">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                  <button
                    onClick={() => { setSwitcherOpen(false); beginEdit(); }}
                    className="w-full flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5"
                    style={{ color: accent }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Create new layout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editing toolbar — name field + Cancel/Save, replaces the layout switcher while active */}
      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <LayoutGrid className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              placeholder="Layout name"
              className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-slate-50 dark:bg-[var(--muted)] text-sm font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={cancelEdit} className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5">
              Cancel
            </button>
            {currentSavedLayout && (
              <button
                onClick={() => saveEdit(false)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            )}
            <button
              onClick={() => saveEdit(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: accent }}
            >
              <Save className="h-3.5 w-3.5" /> {currentSavedLayout ? "Save as new" : "Save layout"}
            </button>
          </div>
        </div>
      )}

      <div className={editing ? "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start" : ""}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={(editing ? draftLayout : layout).map((w) => w.key)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-4 sm:gap-5 auto-rows-min">
              {(editing ? draftLayout : layout).map((w) => (
                <SortableWidgetItem
                  key={w.key} id={w.key} size={w.size} editing={editing}
                  onRemove={() => removeWidget(w.key)}
                  onResize={(size) => resizeWidget(w.key, size)}
                >
                  {renderWidget(w.key)}
                </SortableWidgetItem>
              ))}
              {editing && draftLayout.length === 0 && (
                <div className="col-span-1 sm:col-span-2 md:col-span-6 lg:col-span-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-400">
                  No widgets yet — add some from the library on the right.
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {/* Widget library — only shown while editing */}
        {editing && libraryOpen && (
          <div className="lg:sticky lg:top-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b212e] p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white">Widget library</h5>
              <button onClick={() => setLibraryOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            {WIDGET_CATEGORIES.map((cat) => (
              <div key={cat} className="mb-4 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{cat}</p>
                <div className="flex flex-col gap-1">
                  {WIDGET_CATALOG.filter((w) => w.category === cat).map((w) => {
                    const added = draftLayout.some((d) => d.key === w.key);
                    return (
                      <button
                        key={w.key}
                        onClick={() => (added ? removeWidget(w.key) : addWidget(w.key))}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                          added
                            ? "bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        {w.label}
                        {added ? <span className="text-[10px]">Added</span> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
