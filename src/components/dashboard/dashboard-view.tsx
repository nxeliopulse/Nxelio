"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, CheckCircle2, ChevronDown, Download, RefreshCw, X,
  ArrowRight, Landmark, Briefcase, Activity, Sparkles,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/queries/analytics";
import type { OpportunityRow } from "@/lib/opportunities";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { AiCreditsUsage } from "@/lib/queries/credits";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatStat(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Welcome banner (shown once after checkout completes)
function WelcomeBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [wasTrial, setWasTrial] = useState(false);

  useEffect(() => {
    if (params.get("welcome") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reveal driven by a URL param on mount
      setVisible(true);
      setWasTrial(params.get("trial") === "1");
      router.replace("/dashboard", { scroll: false });
    }
  }, [params, router]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-3.5 animate-in fade-in slide-in-from-top-2 duration-500 mb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Payment method added — you&apos;re all set!</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {wasTrial ? "Your trial is active. Explore all features below." : "Your subscription is active. Explore all features below."}
          </p>
        </div>
      </div>
      <button onClick={() => setVisible(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface OnboardingStatus {
  essentialsDone: boolean;
  inboxConnected: boolean;
  goals: string[];
  userName: string;
}

export function DashboardView({
  stats,
  userName = "User",
  onboardingStatus,
  recentDeals = [],
  collaborators = [],
  meetings = [],
  credits = { used: 0, total: 1500, planId: "free" },
  teamPerformance = [],
}: {
  stats: DashboardStats;
  userName?: string;
  onboardingStatus?: OnboardingStatus;
  recentDeals?: OpportunityRow[];
  collaborators?: { name: string }[];
  meetings?: MeetingRow[];
  credits?: AiCreditsUsage;
  teamPerformance?: { name: string; dealsCount: number; wonValue: number }[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };
  const greeting = getGreeting();

  const [timeframe, setTimeframe] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("Last 30 Days");

  const dateRangeOptions = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
  ];

  const AVATAR_COLORS = ["bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500", "bg-purple-500"];

  // Real revenue/pipeline series computed server-side for weekly/monthly/yearly — no mock arrays.
  const activeChartData = stats.revenueSeries[timeframe];
  const activeChartTotal = activeChartData.reduce((s, d) => s + d.Revenue + d.Pipeline, 0);

  // Real lead-source breakdown (top 4 + Other), computed server-side.
  const sourceColors: Record<string, string> = {
    "LinkedIn": "#0077B5", "Cold Email": "#EA580C", "Email": "#EA580C",
    "Website Form": "#18A7B8", "Website": "#18A7B8", "Referral": "#8B5CF6",
    "Campaigns": "#EC4899", "Campaign": "#EC4899", "Other": "#64748b",
  };
  const donutData = stats.trafficSources.map((s) => ({
    name: s.name, value: s.value, count: s.count, color: sourceColors[s.name] || "#94a3b8",
  }));
  const topSource = donutData[0];

  const [nowMs] = useState(() => Date.now());
  const upcomingMeetings = meetings
    .filter((m) => m.status === "scheduled" && new Date(m.start_at).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  // Real Top Deals — highest-value opportunities from the real recentDeals prop, no mock fallback.
  const topDealsData = [...recentDeals].sort((a, b) => b.deal_value - a.deal_value).slice(0, 5);

  const STAGE_LABEL: Record<string, string> = {
    new: "New", qualified: "Qualified", meeting_scheduled: "Meeting Scheduled",
    proposal_sent: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost",
  };

  // Real Recent Deals table rows — no mock fallback rows.
  const recentDealsTableData = recentDeals.slice(0, 5).map((d) => ({
    id: d.id,
    name: d.name,
    stage: STAGE_LABEL[d.stage] || d.stage,
    value: d.deal_value,
    contact: d.contact_name || "—",
    status: d.stage === "won" ? "Won" : d.stage === "lost" ? "Lost" : "Active",
    statusColor: d.stage === "won" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" : d.stage === "lost" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400" : "bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400",
  }));

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-10 px-4 sm:px-6 text-slate-800 dark:text-slate-200">
      
      {/* Welcome Banner */}
      <Suspense fallback={null}>
        <WelcomeBanner />
      </Suspense>

      {/* Redesigned Dashboard Header */}
      <div className="flex align-items-center justify-between gap-2 mb-4 flex-wrap flex justify-between items-center">
        <div>
          <h4 className="mb-0 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h4>
        </div>

        <div className="gap-2 d-flex align-items-center flex-wrap flex items-center">
          {/* Overlapping collaborators avatar list */}
          <div className="avatar-list-stacked me-2 flex -space-x-1.5 items-center mr-3">
            {collaborators.map((user, i) => (
              <div
                key={i}
                title={user.name}
                className={cn(
                  "h-7 w-7 rounded-full border-2 border-white dark:border-[#0c0d21] flex items-center justify-center text-[10px] font-bold text-white shadow-xs",
                  AVATAR_COLORS[i % AVATAR_COLORS.length]
                )}
              >
                {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            ))}
            <button
              onClick={() => toast("Invite team members feature coming soon!", "info")}
              className="h-7 w-7 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center font-bold text-xs shadow-xs focus:outline-none transition-colors"
            >
              +
            </button>
          </div>

          {/* Daterangepicker display button with active dropdown */}
          <div className="relative">
            <button
              onClick={() => setDateRangeOpen(!dateRangeOpen)}
              className="daterangepick form-control w-auto d-flex align-items-center me-2 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs mr-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <CalendarDays className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span>{activeDateRange}</span>
              <ChevronDown className="h-3 w-3 text-slate-400 ml-1 flex-shrink-0" />
            </button>
            {dateRangeOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                {dateRangeOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setActiveDateRange(opt);
                      setDateRangeOpen(false);
                      toast(`Date range updated to ${opt}.`, "success");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                      activeDateRange === opt ? "text-rose-500 bg-rose-50/50 dark:bg-rose-950/20" : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export / Download trigger */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="p-2 shadow-2xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md gap-1 h-8 w-8 justify-center flex items-center"
              title="Download Report"
            >
              <Download className="h-4 w-4 text-slate-500" />
            </Button>
            {exportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    toast("Downloading PDF analytics...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3.5 w-3.5 text-red-500" /> Download PDF
                </button>
                <button
                  onClick={() => {
                    toast("Downloading Excel metrics...", "info");
                    setExportDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-500" /> Download Excel
                </button>
              </div>
            )}
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast("Refreshing dashboard...", "info");
              router.refresh();
            }}
            className="p-2 shadow-2xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-md h-8 w-8 justify-center flex items-center"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-100/30 dark:border-slate-800 rounded-2xl p-5 mb-4 shadow-3xs flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            👋 {greeting}, <span className="text-blue-600 dark:text-blue-400 font-extrabold">{userName}</span>!
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold leading-relaxed">
            Here is what is happening with your leads and pipeline today.
          </p>
        </div>
        <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
      </div>

      {/* Row 1: Charts (Revenue Analytics & Traffic Sources) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Widget: Revenue Analytics Chart */}
        <div className="lg:col-span-8 flex">
          <Card className="flex-fill bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full">
            <div className="p-4 sm:p-5 pb-0">
              <div className="flex align-items-center justify-between flex-wrap gap-2 mb-3 items-center justify-between">
                <h5 className="mb-0 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
                  Revenue Analytics
                </h5>
                
                {/* Timeframe pill tabs */}
                <ul className="nav nav-tabs nav-solid-danger border dark:border-slate-800 rounded-lg gap-1.5 p-1 flex items-center text-xs font-semibold bg-slate-50/50 dark:bg-slate-900/50">
                  {["weekly", "monthly", "yearly"].map((t) => (
                    <li key={t} className="nav-item">
                      <button
                        onClick={() => setTimeframe(t as "weekly" | "monthly" | "yearly")}
                        className={cn(
                          "nav-link py-1 px-2.5 rounded transition-all capitalize",
                          timeframe === t
                            ? "bg-rose-500 text-white shadow-2xs"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        )}
                      >
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Chart summary and legend stats */}
              <div className="d-flex align-items-center justify-between flex-wrap gap-2 flex justify-between items-center mb-4">
                <div className="d-flex align-items-center flex-wrap gap-2 flex items-center gap-1.5">
                  <h4 className="mb-0 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {money(activeChartTotal)}
                  </h4>
                  <p className="mb-0 text-xs font-medium text-slate-400">Revenue Won + Open Pipeline ({timeframe})</p>
                </div>

                <div className="d-flex align-items-center flex-wrap gap-2 flex items-center gap-2 text-xs font-semibold">
                  <div className="d-flex align-items-center border dark:border-slate-800 rounded px-2 py-1 flex items-center gap-1.5 bg-white dark:bg-slate-900">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-slate-600 dark:text-slate-400">Revenue Won</span>
                  </div>
                  <div className="d-flex align-items-center border dark:border-slate-800 rounded px-2 py-1 flex items-center gap-1.5 bg-white dark:bg-slate-900">
                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="text-slate-600 dark:text-slate-400">Open Pipeline</span>
                  </div>
                </div>
              </div>

              {/* Mixed Recharts Area & Bar Chart */}
              <div className="h-[250px] w-full mt-2 pr-2">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={activeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorPipeline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#475569" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#475569" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="day"
                      stroke="#64748b"
                      fontSize={10}
                      fontFamily="inherit"
                      fontWeight="600"
                      tickLine={false}
                      axisLine={false}
                      dy={5}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      fontFamily="inherit"
                      fontWeight="600"
                      tickLine={false}
                      axisLine={false}
                      dx={-5}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs relative z-50">
                              <p className="font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                              {payload.map((p, i) => (
                                <div key={i} className="flex items-center gap-1.5 py-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                  <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
                                  <span className="font-bold ml-auto" style={{ color: p.color === "#EA580C" ? "#EA580C" : "inherit" }}>
                                    {money(Number(p.value ?? 0))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* Area representing Open Pipeline (background) */}
                    <Area
                      type="monotone"
                      dataKey="Pipeline"
                      name="Open Pipeline"
                      stroke="#64748b"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorPipeline)"
                    />
                    {/* Bar representing Revenue Won (foreground) */}
                    <Bar
                      dataKey="Revenue"
                      name="Revenue Won"
                      fill="#EA580C"
                      radius={[4, 4, 0, 0]}
                      barSize={40}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Widget: Traffic Sources Donut Chart */}
        <div className="lg:col-span-4 flex">
          <Card className="flex-fill bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full flex flex-col">
            <div className="p-4 sm:p-5 flex-1 flex flex-col">
              <div className="d-flex align-items-center justify-between flex-wrap gap-2 mb-0 flex justify-between items-center">
                <h5 className="mb-0 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
                  Traffic Sources
                </h5>
                <button
                  onClick={() => router.push("/leads")}
                  className="btn btn-sm btn-icon btn-outline-light p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </div>

              {donutData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10">
                  <p className="text-xs text-slate-400 text-center">No leads yet — sources will show up here once you have some.</p>
                </div>
              ) : (
                <>
                  {/* Donut Chart using Recharts Pie */}
                  <div className="h-[180px] w-full relative mt-3 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-md text-xs">
                                  <span className="font-bold" style={{ color: payload[0].payload.color }}>
                                    {payload[0].name}
                                  </span>
                                  <span className="ml-1.5 font-bold">{payload[0].value}%</span>
                                  <span className="block text-[10px] text-slate-400 mt-0.5">
                                    Leads: {formatStat(payload[0].payload.count)}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Text centered inside the donut hole — real top source, not hardcoded */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xl font-black text-slate-900 dark:text-white">{topSource?.value ?? 0}%</span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{topSource?.name ?? "—"}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Legend breakdown list */}
            {donutData.length > 0 && (
              <div className="mb-1 border-t border-slate-100 dark:border-slate-800/80">
                {donutData.map((d, i) => (
                  <div
                    key={i}
                    className="px-4 py-2 d-flex align-items-center justify-content-between border-bottom flex justify-between items-center text-xs font-semibold border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 last:pb-3"
                  >
                    <p className="text-slate-700 dark:text-slate-300 d-flex align-items-center mb-0 flex items-center">
                      <span className="h-2 w-2 rounded-full mr-2 inline-block" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </p>
                    <p className="text-slate-900 dark:text-white font-bold mb-0">{formatStat(d.count)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>

      {/* Row 2: KPI Metrics Cards (Revenue, Active Deals, Conversion Rate, Total Contacts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Revenue */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full relative">
          <div className="p-4 sm:p-5 flex flex-col justify-between h-full min-h-[125px]">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Revenue</p>
              <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2.5">
                {money(stats.pipeline.wonValue)}
              </h4>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              {stats.revenueTrendPct !== null && (
                <span className={cn("inline-flex items-center py-0.5 px-2 text-[10px] font-bold rounded-full", stats.revenueTrendPct >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400")}>
                  {stats.revenueTrendPct >= 0 ? "+" : ""}{stats.revenueTrendPct}%
                </span>
              )}
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">{stats.revenueTrendPct !== null ? "vs Last Month" : "No prior month to compare"}</p>
            </div>

            <div className="absolute top-4 right-4 h-10 w-10 rounded-full bg-gradient-to-tr from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
              <Landmark className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Card 2: Active Deals */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full relative">
          <div className="p-4 sm:p-5 flex flex-col justify-between h-full min-h-[125px]">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Active Deals</p>
              <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2.5">
                {formatStat(stats.pipeline.openCount)}
              </h4>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">{money(stats.pipeline.openValue)} open value</p>
            </div>

            <div className="absolute top-4 right-4 h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Card 3: Conversion Rate */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full relative">
          <div className="p-4 sm:p-5 flex flex-col justify-between h-full min-h-[125px]">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Conversion Rate</p>
              <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2.5">
                {stats.conversionRate}%
              </h4>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              {stats.conversionTrendPct !== null && (
                <span className={cn("inline-flex items-center py-0.5 px-2 text-[10px] font-bold rounded-full", stats.conversionTrendPct >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400")}>
                  {stats.conversionTrendPct >= 0 ? "+" : ""}{stats.conversionTrendPct}%
                </span>
              )}
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">{stats.conversionTrendPct !== null ? "vs Last Month" : "No prior month to compare"}</p>
            </div>

            <div className="absolute top-4 right-4 h-10 w-10 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Card 4: Total Contacts with Sparkline and avatar lists */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full">
          <div className="p-4 sm:p-5 flex flex-col justify-between h-full min-h-[125px]">
            
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {formatStat(stats.totalLeads)}
                  </h4>
                  {stats.leadsDelta !== undefined && (
                    <span className={cn("inline-flex items-center py-0.5 px-2 text-[9px] font-bold rounded-full", stats.leadsDelta >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400")}>
                      {stats.leadsDelta >= 0 ? "+" : ""}{stats.leadsDelta}%
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Total Contacts</p>
              </div>

              {/* Real sparkline — new leads per day, last 7 days */}
              <div className="h-[35px] w-[65px] flex-shrink-0">
                <ResponsiveContainer width={65} height={35}>
                  <BarChart data={stats.contactsSparkline.map((v) => ({ value: v }))}>
                    <Bar dataKey="value" fill="#EA580C" radius={[1.5, 1.5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs flex-wrap mt-auto">
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">{stats.leadsDelta !== undefined ? "vs Last Month" : "New leads, last 7 days"}</p>
            </div>

          </div>
        </Card>

      </div>

      {/* ROW 3: Top Deals (1/3), Pipeline Statistics & Profit (1/3), Deals Overview (1/3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Card 3.1: Top Deals */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden flex flex-col h-full min-h-[380px]">
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3.5">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
                Top Deals
              </h5>
              <div className="text-slate-400 dark:text-slate-500 text-xs font-semibold cursor-default hover:text-slate-600">
                Last 30 Days
              </div>
            </div>

            <div className="space-y-4 flex-1">
              {topDealsData.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No deals yet — convert a lead to start your pipeline.</p>
              ) : (
                topDealsData.map((deal, idx) => (
                  <div key={deal.id} className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0", AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                        {deal.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-800 dark:text-slate-200 font-bold truncate leading-none mb-1">{deal.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{deal.company || "—"}</p>
                      </div>
                    </div>
                    <p className="text-slate-900 dark:text-white font-bold">{money(deal.deal_value)}</p>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => router.push("/opportunities")}
              className="w-full mt-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-center block"
            >
              View All &gt;
            </button>
          </div>
        </Card>

        {/* Card 3.2: Pipeline Statistics & Profit */}
        <div className="flex flex-col gap-5 h-full">
          {/* Top Half: Pipeline Statistics */}
          <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden flex-1 p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3.5">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
                Pipeline Statistics
              </h5>
              <div className="text-slate-400 dark:text-slate-500 text-xs font-semibold">
                Weekly
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-3.5 text-center">
              {stats.pipelineBuckets.map((b, i) => (
                <div key={i} className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-medium mb-1 truncate">{b.label}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate mb-0.5">{money(b.value)}</p>
                  <p className="text-[9px] text-slate-500 truncate font-semibold">{b.count} Deals</p>
                </div>
              ))}
            </div>

            <div className="h-[75px] w-full mt-1 pr-2">
              <ResponsiveContainer width="100%" height={75}>
                <BarChart data={stats.pipelineBuckets.map((b) => ({ name: b.label, value: b.value }))}>
                  <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#EA580C" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Bottom Half: Win Rate — real, replaces a fabricated "Profit Earned" figure */}
          <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden p-4 sm:p-5 flex flex-col justify-between h-[150px]">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                Win Rate <span className="text-slate-900 dark:text-white text-sm font-black ml-1">{stats.pipeline.winRate}%</span>
              </h5>
              <div className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold">
                {stats.pipeline.wonCount} Won
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2.5 border border-slate-200 dark:border-slate-800">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${stats.pipeline.winRate}%` }} />
              </div>
              <p>{formatStat(stats.snapshot.emailsSent)} emails sent · {formatStat(stats.snapshot.repliesReceived)} replies</p>
            </div>
          </Card>
        </div>

        {/* Card 3.3: Deals Overview */}
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden flex flex-col h-full min-h-[380px]">
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3.5">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
                Deals Overview
              </h5>
              <button
                onClick={() => router.push("/opportunities")}
                className="btn btn-sm btn-icon btn-outline-light p-1 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>

            {(() => {
              const { successfulCount, successfulValue, pendingCount, pendingValue, rejectedCount, rejectedValue } = stats.dealsOverview;
              const total = successfulCount + pendingCount + rejectedCount;
              const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
              return (
                <>
                  {/* Horizontal progress stacked bar — real, all-time deal outcomes */}
                  <div className="flex h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden gap-0.5 mb-4">
                    <div className="bg-teal-500" style={{ width: `${pct(successfulCount)}%` }} title="Successful" />
                    <div className="bg-sky-500" style={{ width: `${pct(pendingCount)}%` }} title="Pending" />
                    <div className="bg-rose-500" style={{ width: `${pct(rejectedCount)}%` }} title="Rejected" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-4 text-xs font-semibold">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{formatStat(total)}</h4>
                    <p className="text-slate-400 dark:text-slate-500 mb-0 font-medium">total opportunities, all time</p>
                  </div>

                  {/* Breakdown detail list — real counts + values */}
                  <div className="space-y-3 flex-1 mb-4">
                    {[
                      { name: "Successful Deals", count: successfulCount, value: successfulValue, color: "bg-teal-500" },
                      { name: "Pending Deals", count: pendingCount, value: pendingValue, color: "bg-sky-500" },
                      { name: "Rejected Deals", count: rejectedCount, value: rejectedValue, color: "bg-rose-500" },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-xs font-semibold pb-1.5 border-b border-slate-100 dark:border-slate-800/40 last:border-0 last:pb-0">
                        <div className="flex items-center">
                          <span className={cn("h-2 w-2 rounded-full mr-2 inline-block", item.color)} />
                          <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                        </div>
                        <span className="text-slate-900 dark:text-white font-bold">{item.count} · {money(item.value)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Team performance — real, replaces a fabricated avatar/count card */}
                  <div className="p-3 border border-slate-150 dark:border-slate-800/80 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 text-xs font-semibold">
                    <p className="text-slate-400 dark:text-slate-500 font-medium mb-2">Top Performers (all-time won)</p>
                    {teamPerformance.length === 0 ? (
                      <p className="text-slate-400 text-[11px]">No deals assigned to an owner yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {teamPerformance.slice(0, 3).map((rep, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-slate-700 dark:text-slate-300">{rep.name}</span>
                            <span className="text-slate-900 dark:text-white font-bold">{money(rep.wonValue)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

      </div>

      {/* ROW 4: Recent Deals Table */}
      <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden p-4 sm:p-5 w-full">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800 mb-4 flex-wrap gap-2 justify-between items-center">
          <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
            Recent Deals
          </h5>
          <button
            onClick={() => router.push("/opportunities")}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors rounded"
          >
            View All &gt;
          </button>
        </div>

        {/* Responsive deals table */}
        {recentDealsTableData.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No deals yet — convert a lead to start your pipeline.</p>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[600px] border border-slate-100 dark:border-slate-800">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-left border-b border-slate-100 dark:border-slate-800">
                  {["Deal Name", "Stage", "Deal Value", "Contact", "Status"].map((h) => (
                    <th key={h} className="py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentDealsTableData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors">
                    <td className="py-2.5 px-3 truncate max-w-[150px]">{row.name}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{row.stage}</td>
                    <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">{money(row.value)}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{row.contact}</td>
                    <td className="py-2.5 px-3">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", row.statusColor)}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Upcoming Meetings & AI Credits — real data now available from page.tsx */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden p-4 sm:p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3.5">
            <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
              Upcoming Meetings
            </h5>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
              {upcomingMeetings.length} Scheduled
            </span>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Nothing scheduled — book a meeting to see it here.</p>
          ) : (
            <div className="space-y-3">
              {upcomingMeetings.slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-slate-100 dark:border-slate-800/40 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-slate-800 dark:text-slate-200 font-bold truncate">{m.title}</p>
                    <p className="text-[10px] text-slate-400">{new Date(m.start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                  {m.join_url && (
                    <a href={m.join_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded text-[10px] font-bold flex-shrink-0">
                      Join
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden p-4 sm:p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3.5">
            <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
              AI Credits
            </h5>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{credits.planId} plan</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <h4 className="text-xl font-black text-slate-900 dark:text-white">{formatStat(credits.total - credits.used)}</h4>
            <p className="text-xs text-slate-400 font-medium">of {formatStat(credits.total)} remaining</p>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2.5 border border-slate-200 dark:border-slate-800">
            <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${credits.total > 0 ? Math.min(100, Math.round((credits.used / credits.total) * 100)) : 0}%` }} />
          </div>
        </Card>
      </div>

    </div>
  );
}
