"use client";
import { Suspense, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, X, ArrowUpRight, ChevronDown,
  Pencil, GripVertical, Plus, Save, LayoutGrid, Star, Trash2, Flame, Mail, FileDown, Video, CalendarClock, MousePointerClick, Gauge, FileText, Maximize2,
  TrendingUp, TrendingDown, Globe2, Zap, BarChart3, Lightbulb, Sparkles, AlertTriangle, Target, Users, Layers,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis
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

/** Modern Express / DealDeck style KPI Card */
function ModernStatTile({
  label, value, sublabel, icon, variant = "default", trendPct, accentColor = "indigo",
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  variant?: "hero" | "default";
  trendPct?: number | null;
  accentColor?: "blue" | "indigo" | "emerald" | "amber" | "purple" | "cyan";
}) {
  const hasTrend = trendPct !== undefined && trendPct !== null;
  const isUp = hasTrend && trendPct >= 0;

  if (variant === "hero") {
    return (
      <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 text-white relative shadow-xs hover:shadow-md transition-all flex flex-col justify-between min-h-[128px]">
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
              {Math.abs(trendPct).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="mt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-white/90">{label}</span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white mt-1">{value}</h2>
          <p className="text-xs font-medium text-white/80 mt-1 truncate">{sublabel}</p>
        </div>
      </div>
    );
  }

  const ACCENT_STYLES = {
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30",
    purple: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/30",
    cyan: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-100 dark:border-cyan-900/30",
  };

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white relative shadow-xs hover:shadow-md transition-all flex flex-col justify-between min-h-[128px]">
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shadow-2xs ${ACCENT_STYLES[accentColor]}`}>
          {icon}
        </div>
        {hasTrend && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isUp
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40"
            }`}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-slate-900 dark:text-white mt-1">{value}</h2>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">{sublabel}</p>
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
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        <div className="flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-[var(--muted)] p-0.5 shrink-0">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={
                "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors " +
                (period === opt.key
                  ? "bg-white dark:bg-[#1b212e] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} actionLabel={actionLabel} onAction={onOpen} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
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

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col">
            <div className="h-[190px] relative">
              <ResponsiveContainer width="100%" height="100%">
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
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Deals</span>
              </div>
            </div>
            {/* Clean bottom legend chips */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.slice(0, 6).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 mr-1">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-slate-600 dark:text-slate-300 truncate text-[11px]" title={item.name}>{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] shrink-0">{item.pct}%</span>
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
  data, mounted, emptyLabel,
}: {
  data: { name: string; dealsCount: number; wonValue: number }[];
  mounted: boolean; emptyLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.dealsCount + d.wonValue, 0);
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <h5 className="text-base font-bold text-slate-900 dark:text-white mb-1">Team performance</h5>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">All-time deals closed vs. revenue won, by teammate</p>
      <div className="flex-1 min-h-0">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} angle={-20} textAnchor="end" height={30} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                formatter={(v, name) => (name === "wonValue" ? money(Number(v)) : v)}
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

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col">
            <div className="h-[190px] relative">
              <ResponsiveContainer width="100%" height="100%">
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
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">Total Deals</span>
              </div>
            </div>
            {/* Clean bottom legend row with badge pills */}
            <div className="flex items-center justify-around gap-2 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-slate-600 dark:text-slate-300 font-medium text-xs">{item.name}:</span>
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

/** New leads per month for the last 5 months, plus how many of them were hot */
function LeadGrowthCard({ data, mounted, emptyLabel }: { data: { date: string; leads: number; hot: number }[]; mounted: boolean; emptyLabel: string }) {
  const total = data.reduce((s, d) => s + d.leads, 0);
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <h5 className="text-base font-bold text-slate-900 dark:text-white mb-1">Lead growth</h5>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">New leads vs. hot leads, by month</p>
      <div className="flex-1 min-h-0">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
              />
              <Line type="monotone" dataKey="leads" name="New leads" stroke="#6366F1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="hot" name="Hot leads" stroke="#F59E0B" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </Card>
  );
}

/** Your 3 highest-scored leads right now */
function HotLeadAlertsCard({ data, emptyLabel, onOpen }: { data: { name: string; company: string; score: number }[]; emptyLabel: string; onOpen: () => void }) {
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-base font-bold text-slate-900 dark:text-white">Hot lead alerts</h5>
        <button onClick={onOpen} className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 min-h-0"><EmptyChartState label={emptyLabel} /></div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto">
          {data.map((lead, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs" style={{ background: "#F59E0B" }}>
                <Flame className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{lead.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{lead.company}</p>
              </div>
              <span className="text-sm font-bold shrink-0" style={{ color: "#F59E0B" }}>{lead.score}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  email: Mail, page: FileText, download: FileDown, webinar: Video,
  meeting: CalendarClock, click: MousePointerClick, score: Gauge,
};

/** Live feed of what's happening */
function RecentActivityCard({ data, emptyLabel }: { data: { id: string; lead: string; action: string; type: string; time: string }[]; emptyLabel: string }) {
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <h5 className="text-base font-bold text-slate-900 dark:text-white mb-2">Recent activity</h5>
      {data.length === 0 ? (
        <div className="flex-1 min-h-0"><EmptyChartState label={emptyLabel} /></div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto">
          {data.slice(0, 6).map((a) => {
            const Icon = ACTIVITY_ICONS[a.type] ?? FileText;
            return (
              <div key={a.id} className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-[var(--muted)] flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <p className="flex-1 min-w-0 text-xs text-slate-600 dark:text-slate-300 truncate">
                  <span className="font-semibold text-slate-900 dark:text-white">{a.lead}</span> {a.action}
                </p>
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{a.time}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Open rate vs. reply rate per email campaign */
function CampaignPerformanceCard({ data, mounted, emptyLabel }: { data: { name: string; openRate: number; replyRate: number }[]; mounted: boolean; emptyLabel: string }) {
  const total = data.reduce((s, d) => s + d.openRate + d.replyRate, 0);
  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col">
      <h5 className="text-base font-bold text-slate-900 dark:text-white mb-1">Campaign performance</h5>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Open rate vs. reply rate, by campaign</p>
      <div className="flex-1 min-h-0">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} angle={-20} textAnchor="end" height={30} />
              <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
              />
              <Bar dataKey="openRate" name="Open %" fill="#6366F1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="replyRate" name="Reply %" fill="#10B981" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </Card>
  );
}

/** Where leads actually come from — real breakdown */
function LeadSourcesCard({ data, mounted, emptyLabel, onOpen }: { data: { name: string; value: number }[]; mounted: boolean; emptyLabel: string; onOpen: () => void }) {
  const colored = data.map((d, idx) => ({ ...d, color: DONUT_COLORS[idx % DONUT_COLORS.length] }));
  const total = colored.reduce((s, d) => s + d.value, 0);
  const withPct = colored.map((d) => ({ ...d, pct: total ? Math.round((d.value / total) * 1000) / 10 : 0 }));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 h-[360px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-sm font-bold text-slate-900 dark:text-white">Lead sources</h5>
        <button onClick={onOpen} className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        {total === 0 ? (
          <EmptyChartState label={emptyLabel} />
        ) : mounted ? (
          <div className="h-full flex flex-col">
            <div className="h-[190px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(v, name) => [`${v} leads (${withPct.find((p) => p.name === name)?.pct ?? 0}%)`, name]}
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
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">Total Leads</span>
              </div>
            </div>
            {/* Clean bottom legend chips with no text overflow */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {withPct.slice(0, 6).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 mr-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-slate-600 dark:text-slate-300 truncate text-xs" title={item.name}>{item.name}</span>
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
  nav: { settings: () => void; leads: () => void; campaigns: () => void }
): SetupTask[] {
  return [
    {
      id: "connect-email",
      title: "Connect your email",
      description: "Connect Gmail or Outlook to send and track outreach directly from Nxelio.",
      actionLabel: "Connect",
      onAction: nav.settings,
      done: Boolean(onboardingStatus?.inboxConnected),
    },
    {
      id: "connect-calendar",
      title: "Connect your calendar",
      description: "Sync your calendar so meetings booked with leads show up automatically.",
      actionLabel: "Connect",
      onAction: nav.settings,
      done: Boolean(onboardingStatus?.calendarConnected),
    },
    {
      id: "import-leads",
      title: "Import your leads",
      description: "Add or import your first leads to start building your pipeline.",
      actionLabel: "Import",
      onAction: nav.leads,
      done: totalLeads > 0,
    },
    {
      id: "invite-team",
      title: "Invite your team",
      description: "Add teammates so you can share leads and win deals together.",
      actionLabel: "Invite",
      onAction: nav.settings,
      done: collaboratorCount > 1,
    },
    {
      id: "first-campaign",
      title: "Send your first campaign",
      description: "Launch an email campaign to start nurturing leads automatically.",
      actionLabel: "Create",
      onAction: nav.campaigns,
      done: emailsSent > 0,
    },
  ].filter((task) => !task.done);
}

/** Fixed, non-removable setup checklist shown only while onboarding tasks
 *  remain — unlike dashboard widgets, this isn't part of the customizable
 *  "Edit layout" system, since it's account setup rather than a business
 *  metric someone would want to arrange or resize. Once every task is
 *  actually complete the whole card disappears. */
function SetupChecklistCard({ tasks }: { tasks: SetupTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <Card className="bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-indigo-500" />
          <h5 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Finish setting up your workspace</h5>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
          {tasks.length} step{tasks.length === 1 ? "" : "s"} left
        </span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="text-left text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wide">
              <th className="px-3 py-2 font-semibold">Task</th>
              <th className="px-3 py-2 font-semibold hidden md:table-cell">Description</th>
              <th className="px-3 py-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{task.title}</td>
                <td className="px-3 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell max-w-xs">{task.description}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={task.onAction}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {task.actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Live AI summary and recommendations generated from workspace statistics */
function AiInsightsCard({ stats, onOpenProspects, onOpenDeals, onOpenCampaigns }: {
  stats: DashboardStats;
  onOpenProspects: () => void;
  onOpenDeals: () => void;
  onOpenCampaigns: () => void;
}) {
  const summary = buildAiDashboardSummary(stats);

  return (
    <Card className="bg-white dark:bg-[#1b212e] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-2xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h5 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Nxelio AI Intelligence
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
                  Live Copilot
                </span>
              </h5>
            </div>
          </div>
          <button
            onClick={onOpenProspects}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 transition-colors"
          >
            Review hot leads <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-2">
          {/* Workspace Health brief */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#151923] border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> Workspace Health
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{summary.morningBrief}</p>
          </div>

          {/* Top Recommendation */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#151923] border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Action Plan
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {summary.recommendations[0] || "Review open pipeline to keep deals moving forward."}
            </p>
          </div>

          {/* Pipeline Growth Insight */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#151923] border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5">
              <Zap className="h-3.5 w-3.5" /> Growth Insight
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {summary.pipelineSummary[0] || "Pipeline is active and ready for conversion."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 gap-2">
        <span className="text-[11px]">Real-time recommendations update automatically as leads and deals change</span>
        <div className="flex items-center gap-3">
          <button onClick={onOpenDeals} className="hover:text-slate-700 dark:hover:text-slate-300 font-medium transition-colors">View Pipeline</button>
          <span>·</span>
          <button onClick={onOpenCampaigns} className="hover:text-slate-700 dark:hover:text-slate-300 font-medium transition-colors">Campaigns</button>
        </div>
      </div>
    </Card>
  );
}

const SPAN_CLASS: Record<WidgetSize, string> = {
  3: "lg:col-span-3", 4: "lg:col-span-4", 6: "lg:col-span-6", 8: "lg:col-span-8", 12: "lg:col-span-12",
};

/** One widget's slot in the dashboard grid — a dnd-kit sortable item that
 *  becomes draggable (grip handle) and removable (X) only in edit mode, so
 *  the normal view stays exactly as plain as before this feature existed. */
/** One widget's slot in the dashboard grid — a dnd-kit sortable item that
 *  becomes draggable (grip handle), removable (X), and resizable (corner
 *  handle) only in edit mode, so the normal view stays exactly as plain as
 *  before this feature existed. Resize is a raw pointer drag rather than a
 *  library (no free-form grid-resize engine already in this project — see
 *  the analytics_dashboard_widgets research this was built alongside): the
 *  handle tracks horizontal drag distance against the widget's own current
 *  pixel width to estimate one grid column's width, then snaps to the
 *  nearest allowed size on every pointermove for live feedback. */
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
    <div ref={setRefs} style={style} className={`col-span-1 ${SPAN_CLASS[size]} relative`}>
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };
  const greeting = getGreeting();

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
      case "total_sales": return (
        <ModernStatTile
          label="Total sales"
          value={money(stats.pipeline.wonValue)}
          sublabel="All-time won revenue"
          variant="hero"
          icon={<Zap className="h-4 w-4" />}
          trendPct={stats.revenueTrendPct}
        />
      );
      case "win_rate": return (
        <ModernStatTile
          label="Win rate"
          value={`${stats.pipeline.winRate}%`}
          sublabel="Won ÷ closed deals"
          accentColor="purple"
          icon={<Target className="h-4 w-4" />}
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
        />
      );
      case "avg_days_to_close": return (
        <ModernStatTile
          label="Avg days to close"
          value={stats.avgDaysToClose !== null ? stats.avgDaysToClose.toString() : "—"}
          sublabel="Won deals, all-time"
          accentColor="cyan"
          icon={<CalendarClock className="h-4 w-4" />}
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
        />
      );
      case "weighted_value": return (
        <ModernStatTile
          label="Weighted value"
          value={money(stats.weightedPipelineValue)}
          sublabel="Stage-likelihood estimate"
          accentColor="amber"
          icon={<Sparkles className="h-4 w-4" />}
        />
      );
      case "avg_open_deal_age": return (
        <ModernStatTile
          label="Avg open deal age"
          value={stats.avgOpenDealAge !== null ? stats.avgOpenDealAge.toString() : "—"}
          sublabel="Days since created"
          accentColor="emerald"
          icon={<Gauge className="h-4 w-4" />}
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
        <DualLineTrendCard
          title="Deals projection (next 12 months)"
          subtitle="Open deals' expected value vs. count, by expected close month"
          data={stats.dealsProjection}
          moneyKey="Projected value"
          countKey="Deals due"
          lineColor={DONUT_COLORS[5]}
          lineColorSoft={DONUT_COLORS[2]}
          emptyLabel="No open deals have an expected close date set yet."
          mounted={chartsMounted}
          actionLabel="Add New Opportunity"
          onOpen={() => router.push("/opportunities")}
        />
      );
      case "sales_pipeline": return (
        <LabeledDonutCard title="Sales pipeline" data={stageFunnelData} mounted={chartsMounted} emptyLabel="No open or lost deals yet." onOpen={() => router.push("/opportunities")} />
      );
      case "deal_outcomes": return (
        <DealOutcomesDonutCard title="Deal outcomes" data={dealOutcomeData} mounted={chartsMounted} emptyLabel="No closed deals yet." onOpen={() => router.push("/opportunities")} />
      );
      case "team_performance": return (
        <TeamPerformanceBarCard data={teamPerformance} mounted={chartsMounted} emptyLabel="No deals assigned to a teammate yet." />
      );
      case "lead_growth": return (
        <LeadGrowthCard data={stats.leadGrowth} mounted={chartsMounted} emptyLabel="No new leads in the last few months yet." />
      );
      case "hot_leads": return (
        <HotLeadAlertsCard data={stats.hotLeadAlerts} emptyLabel="No hot leads right now." onOpen={() => router.push("/prospects")} />
      );
      case "recent_activity": return (
        <RecentActivityCard data={stats.recentActivities} emptyLabel="No recent activity yet." />
      );
      case "campaign_performance": return (
        <CampaignPerformanceCard data={stats.campaignPerf} mounted={chartsMounted} emptyLabel="No campaigns with activity yet." />
      );
      case "lead_sources": return (
        <LeadSourcesCard data={stats.trafficSources} mounted={chartsMounted} emptyLabel="No leads with a known source yet." onOpen={() => router.push("/prospects")} />
      );
      case "recent_deals": return (
        <RecentDealsCard data={recentDeals} emptyLabel="No deals yet." onOpen={() => router.push("/opportunities")} />
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
    {
      settings: () => router.push("/settings"),
      leads: () => router.push("/leads"),
      campaigns: () => router.push("/campaigns"),
    }
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
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {greeting}, {firstName}! 👋
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Here&apos;s what&apos;s happening in your pipeline today.</p>
        </div>
      </div>

      {/* Setup checklist — fixed, not part of the customizable layout; only
          renders while real setup tasks remain (see SetupChecklistCard) */}
      <SetupChecklistCard tasks={setupTasks} />

      {/* Layout controls — hidden while editing, since Save/Cancel below take over */}
      {!editing && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={beginEdit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit layout
          </button>
          <div className="relative" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b212e] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {currentSavedLayout?.name ?? "Overview"} <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {switcherOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b212e] shadow-lg z-30 py-1.5">
                <button
                  onClick={() => switchLayout(null)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5 ${currentLayoutId === null ? "text-slate-900 dark:text-white font-bold" : "text-slate-600 dark:text-slate-300"}`}
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 auto-rows-min">
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
                <div className="col-span-1 lg:col-span-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-400">
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
