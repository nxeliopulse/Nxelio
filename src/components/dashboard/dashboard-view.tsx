"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, CheckCircle2, CheckSquare, Circle, Clock, Flame, LayoutGrid, Lightbulb,
  Mail, MailOpen, MoreHorizontal, Plus, Radio, Settings, Sliders, Sparkles, Target, TrendingUp,
  Users2, Zap, X,
} from "lucide-react";
import { useAssistant, DEFAULT_SUGGESTIONS } from "@/components/layout/assistant-context";
import {
  Area, AreaChart, Bar, BarChart, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/queries/analytics";

// ── Welcome banner (shown once after checkout completes) ─────────────────────
function WelcomeBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (params.get("welcome") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reveal driven by a URL param on mount
      setVisible(true);
      // Strip the param so a refresh doesn't re-show it
      router.replace("/dashboard", { scroll: false });
    }
  }, [params, router]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-3.5 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-100">Payment method added — you&apos;re all set!</p>
          <p className="text-xs text-gray-500 mt-0.5">Your trial is active. Explore all features below.</p>
        </div>
      </div>
      <button onClick={() => setVisible(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const BLUE   = "#2563eb";
const INDIGO = "#4f46e5";
const GRAY   = "#94a3b8";
const ORANGE = "#f59e0b";

// ── Widget registry ──────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: "meetings",         label: "Meetings Schedule",     desc: "Calendar meetings and timeline" },
  { id: "tasks",            label: "Tasks & To-Dos",        desc: "Open and completed task list" },
  { id: "activity_feed",    label: "Activity Feed",         desc: "Real-time engagement activity timeline" },
  { id: "kpi",              label: "KPI Overview",          desc: "Key metrics at a glance" },
  { id: "campaign_perf",    label: "Campaign Performance",  desc: "Opens, clicks & conversions trend" },
  { id: "campaign_types",   label: "Campaign Types",        desc: "Distribution donut chart" },
  { id: "top_automations",  label: "Top Automations",       desc: "Best-performing campaigns" },
  { id: "audience_growth",  label: "Audience Growth",       desc: "Monthly lead volume bar chart" },
  { id: "recent_campaigns", label: "Recent Campaigns",      desc: "Campaign activity table" },
  { id: "ai_insights",      label: "AI Insights",           desc: "Smart recommendations" },
  { id: "getting_started",  label: "Getting Started",       desc: "Setup checklist & playbooks" },
  { id: "hot_leads",        label: "Hot Leads Trend",       desc: "Hot lead conversions over time" },
  { id: "reply_rates",      label: "Reply Rates",           desc: "Reply rate per campaign" },
  { id: "conversion",       label: "Conversion Rate",       desc: "Overall lead conversion gauge" },
  { id: "snapshot",         label: "Workspace Snapshot",    desc: "Key workspace totals" },
] as const;

type WidgetId = (typeof WIDGET_DEFS)[number]["id"];
type Visibility = Record<WidgetId, boolean>;

const DEFAULT_VIS: Visibility = {
  meetings: true, tasks: true, activity_feed: true,
  kpi: true, campaign_perf: true, campaign_types: true,
  top_automations: true, audience_growth: true, recent_campaigns: true,
  ai_insights: true, getting_started: true,
  hot_leads: false, reply_rates: false, conversion: false, snapshot: false,
};
const STORAGE_KEY = "lp_dashboard_widgets";

function loadVis(): Visibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try { return { ...DEFAULT_VIS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return DEFAULT_VIS; }
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
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

const statusColor: Record<string, string> = {
  Active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  Scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-slate-100 text-slate-500 border-slate-200",
  Paused:    "bg-amber-50 text-amber-700 border-amber-200",
};

interface OnboardingStatus {
  essentialsDone: boolean;
  inboxConnected: boolean;
  goals: string[];
  userName: string;
}

// ── Main component ────────────────────────────────────────────────────────────
export function DashboardView({
  stats,
  onboardingStatus,
}: {
  stats: DashboardStats;
  onboardingStatus?: OnboardingStatus;
}) {
  const router = useRouter();
  const { toggle: toggleAssistant, setSuggestions } = useAssistant();
  const [vis, setVis] = useState<Visibility>(DEFAULT_VIS);
  const [customizing, setCustomizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate from localStorage on mount
  useEffect(() => { setVis(loadVis()); }, []);

  // Build dynamic AI suggestions from real stats
  useEffect(() => {
    const s = stats;
    const suggs = [...DEFAULT_SUGGESTIONS];
    if (s.hotLeads > 0)
      suggs.unshift({ Icon: Flame, text: `You have ${s.hotLeads} hot lead${s.hotLeads > 1 ? "s" : ""} — follow up now` });
    if (s.avgOpenRate > 0 && s.avgOpenRate < 25)
      suggs.splice(1, 0, { Icon: Lightbulb, text: `Open rate is ${s.avgOpenRate}% — try optimizing subject lines` });
    if (s.campaignPerf.length === 0)
      suggs.splice(1, 0, { Icon: Zap, text: "Launch your first campaign to start tracking performance" });
    if (s.totalLeads > 50)
      suggs.splice(2, 0, { Icon: Users2, text: `${s.totalLeads} leads in your workspace — build a segment` });
    setSuggestions(suggs.slice(0, 4));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWidget(id: WidgetId) {
    setVis((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Close panel on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setCustomizing(false);
    }
    if (customizing) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [customizing]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const perfData = stats.leadGrowth.map((m) => ({
    date: m.date,
    Opens:       m.leads,
    Clicks:      Math.round(m.leads * 0.48),
    Conversions: m.hot || Math.round(m.leads * 0.18),
  }));

  // Real campaign type counts — fall back to a single placeholder if everything is 0
  const ct = stats.campaignTypes;
  const ctTotal = ct.campaigns + ct.newsletters + ct.segments + ct.workflows;
  const donutData = ctTotal > 0
    ? [
        { name: "Campaigns",    value: ct.campaigns,   color: BLUE },
        { name: "Newsletters",  value: ct.newsletters, color: INDIGO },
        { name: "Segments",     value: ct.segments,    color: "#818cf8" },
        { name: "Workflows",    value: ct.workflows,   color: ORANGE },
      ].filter((d) => d.value > 0)
    : [{ name: "No data yet", value: 1, color: "#e2e8f0" }];
  const donutTotal = ctTotal > 0 ? ctTotal : 1;
  const donutCenter = donutData[0]?.name ?? "—";
  const donutCenterPct = ctTotal > 0 ? Math.round((donutData[0].value / ctTotal) * 100) : 0;

  const topAutomations = stats.campaignPerf.slice(0, 2).map((c) => ({
    name: c.name,
    rate: c.openRate,
    triggered: Math.round((c.openRate / 100) * 400 + 80),
    completed:  Math.round((c.openRate / 100) * 340 + 50),
  }));

  const peakIdx = stats.leadGrowth.reduce((best, m, i, arr) => m.leads > arr[best].leads ? i : best, 0);
  const audienceData = stats.leadGrowth.map((m, i) => ({ month: m.date, value: m.leads, peak: i === peakIdx }));

  const statusList = ["Active", "Scheduled", "Active", "Completed"];
  const recentCampaigns = stats.campaignPerf.slice(0, 4).map((c, i) => ({
    name: c.name,
    status: statusList[i] ?? "Completed",
    sent:  stats.snapshot.emailsSent > 0 ? Math.max(100, Math.round(stats.snapshot.emailsSent / (i + 1.5))) : 2450,
    opens: Math.round((c.openRate / 100) * (stats.snapshot.emailsSent > 0 ? Math.max(100, Math.round(stats.snapshot.emailsSent / (i + 1.5))) : 2450)),
  }));

  const AI_INSIGHTS = [
    { Icon: Clock,      title: "Best Send Time",   body: "Tuesday at 10 AM shows highest open rates" },
    { Icon: Lightbulb,  title: "Subject Line Tip", body: "Adding personalization increases opens by 26%" },
    { Icon: TrendingUp, title: "Audience Trend",   body: "Your list grew 12% faster this month" },
  ];

  const KPI_CARDS = [
    { label: "Total Leads",      value: stats.totalLeads.toLocaleString(),          Icon: Users2,   color: "bg-blue-50 text-blue-600",    delta: stats.leadsDelta },
    { label: "Hot Leads",        value: stats.hotLeads.toLocaleString(),             Icon: Flame,    color: "bg-amber-50 text-amber-600",  delta: undefined },
    { label: "Avg Open Rate",    value: `${stats.avgOpenRate}%`,                     Icon: MailOpen, color: "bg-emerald-50 text-emerald-600", delta: undefined },
    { label: "Conversion Rate",  value: `${stats.conversionRate}%`,                  Icon: Target,   color: "bg-indigo-50 text-indigo-600", delta: undefined },
    { label: "Emails Sent",      value: stats.snapshot.emailsSent.toLocaleString(),  Icon: Mail,     color: "bg-sky-50 text-sky-600",      delta: undefined },
    { label: "Replies",          value: stats.snapshot.repliesReceived.toLocaleString(), Icon: TrendingUp, color: "bg-violet-50 text-violet-600", delta: undefined },
  ];

  // ── New-widget derived data ───────────────────────────────────────────────
  const hotTrend = stats.leadGrowth.map((m) => ({ date: m.date, Hot: m.hot }));
  const replyData = stats.campaignPerf.map((c) => ({ name: c.name, replyRate: c.replyRate }));
  const convPct = Math.min(100, Math.max(0, stats.conversionRate));
  const convData = [
    { name: "Converted", value: convPct, color: BLUE },
    { name: "Rest", value: 100 - convPct, color: "#e2e8f0" },
  ];
  const snapshotStats = [
    { label: "Emails sent", value: stats.snapshot.emailsSent.toLocaleString(), Icon: Mail, color: "bg-blue-50 text-blue-600" },
    { label: "Replies received", value: stats.snapshot.repliesReceived.toLocaleString(), Icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
    { label: "Hot leads", value: stats.snapshot.hotLeads.toLocaleString(), Icon: Flame, color: "bg-amber-50 text-amber-600" },
    { label: "AI scored", value: stats.snapshot.aiScored.toLocaleString(), Icon: Sparkles, color: "bg-indigo-50 text-indigo-600" },
  ];

  const visibleCount = WIDGET_DEFS.filter((w) => vis[w.id]).length;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">

      {/* ── Welcome banner (post-checkout) ── */}
      <Suspense fallback={null}>
        <WelcomeBanner />
      </Suspense>

      {/* ── Header ── */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setCustomizing(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
        >
          <Sliders className="h-4 w-4 text-slate-500" />
          Customize
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {vis.kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {KPI_CARDS.map((k) => (
            <Card key={k.label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", k.color)}>
                  <k.Icon className="h-4 w-4" strokeWidth={2} />
                </div>
                {k.delta !== undefined && (
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                    k.delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                  )}>
                    {k.delta >= 0 ? "+" : ""}{k.delta}%
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-slate-900 leading-none">{k.value}</p>
              <p className="text-xs text-slate-400 mt-1">{k.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ── Widgets — single responsive grid; auto-fills & reflows for any toggle combo ── */}
      {(vis.campaign_perf || vis.campaign_types || vis.top_automations || vis.audience_growth || vis.recent_campaigns || vis.ai_insights || vis.getting_started || vis.hot_leads || vis.reply_rates || vis.conversion || vis.snapshot) && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(330px,1fr))] [&>*]:min-w-0">
          {vis.campaign_perf && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Campaign Performance</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Last {stats.leadGrowth.length} months overview</p>
                <div className="flex items-center gap-4 mt-2">
                  {[{ label: "Opens", color: BLUE }, { label: "Clicks", color: GRAY }, { label: "Conversions", color: ORANGE }].map((l) => (
                    <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />{l.label}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-1">
                  <ResponsiveContainer width="100%" height={210}>
                    <AreaChart data={perfData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gOpens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
                          <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: BLUE, strokeWidth: 1, strokeDasharray: "4 4" }} />
                      <Area type="monotone" dataKey="Opens"       stroke={BLUE}   strokeWidth={2.5} fill="url(#gOpens)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                      <Area type="monotone" dataKey="Clicks"      stroke={GRAY}   strokeWidth={2}   fill="none"          dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                      <Area type="monotone" dataKey="Conversions" stroke={ORANGE} strokeWidth={2}   fill="none"          dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                    </AreaChart>
                  </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {vis.campaign_types && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Campaign Types</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Distribution</p>
              </CardHeader>
              <CardContent className="pt-1 flex flex-col items-center">
                <div className="h-[190px] w-full relative">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={84} paddingAngle={3} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
                            <span className="font-semibold text-slate-800">{payload[0].name}</span>
                            <span className="ml-2 text-slate-500">
                              {ctTotal > 0 ? Math.round(((payload[0].value as number) / donutTotal) * 100) : 0}%
                            </span>
                          </div>
                        ) : null
                      } />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-sm font-semibold text-slate-800">{donutCenter}</span>
                    <span className="text-xs text-slate-400">{ctTotal > 0 ? `${donutCenterPct}%` : "Empty"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
                  {donutData.map((d) => (
                    <span key={d.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {vis.top_automations && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between pb-1">
                <div>
                  <CardTitle className="text-base font-semibold">Top Automations</CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">Best performers</p>
                </div>
                <button suppressHydrationWarning onClick={() => router.push("/campaigns")} className="text-xs font-medium text-blue-600 hover:underline mt-1">View All</button>
              </CardHeader>
              <CardContent className="pt-2 space-y-4">
                {topAutomations.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No campaign data yet.</p>
                ) : topAutomations.map((a, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 space-y-2">
                    <p className="text-xs text-slate-500 truncate">{a.name}</p>
                    <p className="text-2xl font-bold text-slate-900">{a.rate.toFixed(1)}%</p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{a.triggered} triggered</span>
                      <span>{a.completed} completed</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, a.rate)}%`, background: `linear-gradient(90deg, ${BLUE}, ${INDIGO})` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {vis.audience_growth && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Audience Growth</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={audienceData} margin={{ top: 24, right: 4, left: -16, bottom: 0 }} barSize={28}>
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(37,99,235,0.04)" }} />
                      <Bar dataKey="value" name="Leads" radius={[6, 6, 0, 0]}>
                        {audienceData.map((entry, i) => <Cell key={i} fill={entry.peak ? BLUE : "#e2e8f0"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {vis.recent_campaigns && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-base font-semibold">Recent Campaigns</CardTitle>
                <button onClick={() => router.push("/campaigns")} className="text-xs font-medium text-blue-600 hover:underline">View All</button>
              </CardHeader>
              <CardContent className="pt-2">
                {recentCampaigns.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No campaigns yet.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {["Campaign", "Status", "Sent", "Opens"].map((h) => (
                          <th key={h} className="pb-2.5 text-left text-xs font-medium text-slate-400 px-1 first:pl-0">{h}</th>
                        ))}
                        <th className="pb-2.5 w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentCampaigns.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors group">
                          <td className="py-2.5 pl-0 pr-1 text-xs font-medium text-slate-800 truncate max-w-[110px]">{c.name}</td>
                          <td className="py-2.5 px-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusColor[c.status] ?? statusColor.Completed}`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-1 text-xs text-slate-500">{c.sent.toLocaleString()}</td>
                          <td className="py-2.5 px-1 text-xs text-slate-500">{c.opens.toLocaleString()}</td>
                          <td className="py-2.5 pl-1 pr-0">
                            <button className="p-1 rounded hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {vis.ai_insights && (
            <Card className="flex flex-col">
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">AI Insights</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 flex flex-col flex-1 gap-3">
                {AI_INSIGHTS.map((ins, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-default">
                    <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <ins.Icon className="h-4 w-4 text-slate-600" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{ins.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{ins.body}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-auto pt-1">
                  <button
                    onClick={toggleAssistant}
                    className="w-full rounded-xl h-11 text-sm font-medium text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(to right, #1d4ed8, #2563eb, #4f46e5)" }}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Assistant
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
          {vis.getting_started && (
            <Card className="flex flex-col">
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">
                  {onboardingStatus?.userName
                    ? `Welcome, ${onboardingStatus.userName} 👋`
                    : "Getting Started"}
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Your setup checklist</p>
              </CardHeader>
              <CardContent className="pt-2 flex flex-col flex-1 gap-2">
                {[
                  {
                    label: "Company essentials",
                    done: onboardingStatus?.essentialsDone ?? false,
                    href: "/onboarding",
                  },
                  {
                    label: "Connect your inbox",
                    done: onboardingStatus?.inboxConnected ?? false,
                    href: "/settings",
                  },
                ].map((task) => (
                  <div
                    key={task.label}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    {task.done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300 flex-shrink-0" />
                    )}
                    <span className={cn("flex-1 text-sm", task.done ? "line-through text-slate-400" : "text-slate-700")}>
                      {task.label}
                    </span>
                    {!task.done && (
                      <button
                        onClick={() => router.push(task.href)}
                        className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0"
                      >
                        Start →
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  {[onboardingStatus?.essentialsDone, onboardingStatus?.inboxConnected].filter(Boolean).length} of 2 steps done
                </p>
              </CardContent>
            </Card>
          )}

          {vis.hot_leads && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Hot Leads Trend</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Hot conversions over time</p>
              </CardHeader>
              <CardContent className="pt-1">
                  <ResponsiveContainer width="100%" height={210}>
                    <AreaChart data={hotTrend} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gHot" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ORANGE} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: "4 4" }} />
                      <Area type="monotone" dataKey="Hot" stroke={ORANGE} strokeWidth={2.5} fill="url(#gHot)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                    </AreaChart>
                  </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {vis.reply_rates && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Reply Rates</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Reply rate per campaign</p>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="h-[210px]">
                  {replyData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">No campaigns yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={replyData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barSize={26}>
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={36} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(37,99,235,0.04)" }} />
                        <Bar dataKey="replyRate" name="Reply %" fill={INDIGO} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {vis.conversion && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Conversion Rate</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Leads converted overall</p>
              </CardHeader>
              <CardContent className="pt-1 flex flex-col items-center">
                <div className="h-[190px] w-full relative">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={convData} cx="50%" cy="50%" innerRadius={62} outerRadius={84} paddingAngle={0} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                        {convData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-slate-900">{stats.conversionRate}%</span>
                    <span className="text-xs text-slate-400">converted</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {stats.hotLeads.toLocaleString()} hot of {stats.totalLeads.toLocaleString()} leads
                </p>
              </CardContent>
            </Card>
          )}

          {vis.snapshot && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Workspace Snapshot</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Key totals</p>
              </CardHeader>
              <CardContent className="pt-2 space-y-2.5">
                {snapshotStats.map((s) => (
                  <div key={s.label} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", s.color)}>
                      <s.Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <span className="text-sm text-slate-600">{s.label}</span>
                    <span className="ml-auto text-base font-bold text-slate-900 tabular-nums">{s.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Customize panel (slide-over) ── */}
      {/* Backdrop */}
      <div
        className={cn("fixed inset-0 bg-black/20 z-40 transition-opacity duration-200", customizing ? "opacity-100" : "opacity-0 pointer-events-none")}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out",
          customizing ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Customize Dashboard</h2>
          </div>
          <button onClick={() => setCustomizing(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Widgets</p>
          {WIDGET_DEFS.map((w) => (
            <button
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all",
                vis[w.id]
                  ? "border-blue-200 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              {/* Toggle */}
              <div className={cn(
                "mt-0.5 h-5 w-9 rounded-full flex-shrink-0 transition-colors relative",
                vis[w.id] ? "bg-blue-600" : "bg-slate-200"
              )}>
                <span className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  vis[w.id] ? "translate-x-4" : "translate-x-0.5"
                )} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", vis[w.id] ? "text-blue-900" : "text-slate-700")}>{w.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{w.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Panel footer */}
        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-400 text-center">{visibleCount} of {WIDGET_DEFS.length} widgets visible</p>
          <button
            onClick={() => {
              setVis(DEFAULT_VIS);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VIS));
            }}
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
