"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, CheckCircle2, ChevronDown, Download, RefreshCw, X,
  ArrowRight, Landmark, Briefcase, Activity, Sparkles,
  TrendingUp, TrendingDown, Wallet, CreditCard, Users, Trophy,
  MoreVertical, FileText, Check, Laptop, Globe, Smartphone, Shirt, Home,
  Search, Settings, Bell, ArrowUpRight, User, Target, Crown,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/queries/analytics";
import type { OpportunityRow } from "@/lib/opportunities";
import type { MeetingRow } from "@/lib/queries/meetings";
import type { AiCreditsUsage } from "@/lib/queries/credits";
import type { AiDashboardSummary } from "@/lib/ai/dashboard-insights";
import { usePageTour } from "@/components/tour/use-page-tour";
import { DASHBOARD_TOUR_STEPS } from "@/components/tour/tour-registry";

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
      <button onClick={() => setVisible(false)} className="text-slate-600 hover:text-slate-300 dark:hover:text-slate-700 transition-colors">
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

interface UsageHistoryEntry {
  id: string;
  operation_type: string;
  credits_delta: number;
  resource_type: "credits" | "leads";
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const PLAN_NAME: Record<string, string> = { basic: "Basic", starter: "Starter", pro: "Pro" };

export function DashboardView({
  stats,
  userName = "User",
  onboardingStatus,
  recentDeals = [],
  collaborators = [],
  meetings = [],
  credits = { used: 0, total: 400, planId: "basic", status: "trialing", trialEndsAt: null, leadsRemaining: 0, leadsTotal: 0 },
  usageHistory = [],
  teamPerformance = [],
  aiSummary,
}: {
  stats: DashboardStats;
  userName?: string;
  onboardingStatus?: OnboardingStatus;
  recentDeals?: OpportunityRow[];
  collaborators?: { name: string }[];
  meetings?: MeetingRow[];
  credits?: AiCreditsUsage;
  usageHistory?: UsageHistoryEntry[];
  teamPerformance?: { name: string; dealsCount: number; wonValue: number }[];
  aiSummary: AiDashboardSummary;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  usePageTour("dashboard", DASHBOARD_TOUR_STEPS);

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

  const activeChartData = stats.revenueSeries[timeframe];
  const activeChartTotal = activeChartData.reduce((s, d) => s + d.Revenue + d.Pipeline, 0);

  const sourceColors: Record<string, string> = {
    "LinkedIn": "#696cff", "Cold Email": "#03c3ec", "Email": "#03c3ec",
    "Website Form": "#71dd37", "Website": "#71dd37", "Referral": "#ffab00",
    "Campaigns": "#ff3e1d", "Campaign": "#ff3e1d", "Other": "#8592a3",
  };
  const defaultColors = ["#696cff", "#03c3ec", "#71dd37", "#ffab00", "#ff3e1d", "#8592a3"];
  const donutData = stats.trafficSources.map((s, idx) => {
    const normalized = s.name.trim();
    let color = "#8592a3";
    const matchedKey = Object.keys(sourceColors).find(
      key => normalized.toLowerCase().includes(key.toLowerCase())
    );
    if (matchedKey) {
      color = sourceColors[matchedKey];
    } else {
      color = defaultColors[idx % defaultColors.length];
    }
    return {
      name: s.name,
      value: s.value,
      count: s.count,
      color: color,
    };
  });
  const topSource = donutData[0];

  const [nowMs] = useState(() => Date.now());
  const upcomingMeetings = meetings
    .filter((m) => m.status === "scheduled" && new Date(m.start_at).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const topDealsData = [...recentDeals].sort((a, b) => b.deal_value - a.deal_value).slice(0, 5);

  const STAGE_LABEL: Record<string, string> = {
    new: "New", qualified: "Qualified", meeting_scheduled: "Meeting Scheduled",
    proposal_sent: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost",
  };

  const recentDealsTableData = recentDeals.slice(0, 5).map((d) => ({
    id: d.id,
    name: d.name,
    stage: STAGE_LABEL[d.stage] || d.stage,
    value: d.deal_value,
    contact: d.contact_name || "—",
    status: d.stage === "won" ? "Won" : d.stage === "lost" ? "Lost" : "Active",
    statusColor: d.stage === "won" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" : d.stage === "lost" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400" : "bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400",
  }));

  // Get first name for greeting
  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10 px-4 sm:px-6 text-slate-800 dark:text-slate-200">
      
      {/* Welcome Banner */}
      <Suspense fallback={null}>
        <WelcomeBanner />
      </Suspense>

      {/* Header section */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Hello, {firstName}! 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here is what's happening in your pipeline this month.
        </p>
      </div>

      {/* Dynamic AI dashboard brief. Generated from the current workspace snapshot. */}
      <Card className="bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-indigo-950/30 dark:via-[#1b212e] dark:to-cyan-950/20 border-indigo-200/70 dark:border-indigo-900/50 rounded-2xl shadow-xs p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-indigo-600 dark:text-indigo-300">AI dashboard</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your workspace brief</h2>
              <p className="text-xs text-slate-500 mt-1">Updated from your latest workspace data.</p>
            </div>
          </div>
          <button onClick={() => router.push("/analytics")} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline whitespace-nowrap">
            Open analytics <ArrowRight className="inline h-3.5 w-3.5 ml-0.5" />
          </button>
        </div>

        <p className="text-sm leading-6 text-slate-700 dark:text-slate-200 mb-4">{aiSummary.morningBrief}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {["dailySummary", "weeklySummary"].map((key) => (
            <div key={key} className="rounded-xl bg-white/70 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">{key === "dailySummary" ? "Daily summary" : "Weekly outlook"}</p>
              <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{aiSummary[key as "dailySummary" | "weeklySummary"]}</p>
            </div>
          ))}
          <div className="rounded-xl bg-white/70 dark:bg-white/[0.04] border border-white/80 dark:border-white/10 p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Next best action</p>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{aiSummary.recommendations[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          {[
            ["Pipeline", aiSummary.pipelineSummary[0]],
            ["Revenue", aiSummary.revenueInsights[1]],
            ["Prospects", aiSummary.leadInsights[0]],
            ["Campaigns", aiSummary.campaignInsights[1]],
          ].map(([label, text]) => (
            <div key={label} className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/50 dark:bg-slate-900/20 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">{label}</p>
              <p className="text-xs leading-5 text-slate-700 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>

        {aiSummary.riskAlerts.length > 0 && (
          <div className="border-t border-indigo-100 dark:border-indigo-900/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Risk alerts</p>
            </div>
            <div className="space-y-2">
              {aiSummary.riskAlerts.slice(0, 3).map((alert) => (
                <button key={`${alert.title}-${alert.link}`} onClick={() => router.push(alert.link)} className="w-full text-left rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 px-3 py-2 hover:bg-amber-100/80 dark:hover:bg-amber-950/30 transition-colors">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{alert.title}</p>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">{alert.message}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Main Grid Layout (Left: KPI cards; Right: Bar Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: 2x2 KPI Cards (lg:col-span-5) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          
          {/* Card 1: Total Revenue (Highlight Indigo/Blue) */}
          <Card className="bg-indigo-600 dark:bg-indigo-700 text-white p-5 rounded-2xl border-none shadow-md flex flex-col justify-between min-h-[160px] relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold opacity-90 uppercase tracking-wider">Total revenue</span>
              <button 
                onClick={() => router.push("/opportunities")} 
                className="p-1.5 bg-white/15 hover:bg-white/25 rounded-full transition-colors text-white"
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{money(stats.pipeline.wonValue)}</h2>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">
                  {stats.revenueTrendPct !== null ? (stats.revenueTrendPct >= 0 ? "+" : "") + stats.revenueTrendPct.toFixed(1) + "%" : "+14.0%"}
                </span>
                <span className="text-[10px] opacity-80">This month vs last</span>
              </div>
            </div>
          </Card>

          {/* Card 2: Total Deals */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total deals</span>
              <button 
                onClick={() => router.push("/opportunities")} 
                className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400"
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
                {stats.pipeline.wonCount + stats.pipeline.openCount}
              </h2>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded">
                  -4.2%
                </span>
                <span className="text-[10px] text-slate-400">Active in pipeline</span>
              </div>
            </div>
          </Card>

          {/* Card 3: Total Prospects */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total prospects</span>
              <button 
                onClick={() => router.push("/leads")} 
                className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400"
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
                {formatStat(stats.totalLeads)}
              </h2>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                  +4.8%
                </span>
                <span className="text-[10px] text-slate-400">Registered leads</span>
              </div>
            </div>
          </Card>

          {/* Card 4: Pipeline Value */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pipeline value</span>
              <button 
                onClick={() => router.push("/opportunities")} 
                className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400"
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
                {money(stats.pipeline.openValue)}
              </h2>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                  +5.6%
                </span>
                <span className="text-[10px] text-slate-400">Expected future revenue</span>
              </div>
            </div>
          </Card>

        </div>

        {/* Right Side: Large Revenue Bar Chart (lg:col-span-7) */}
        <div className="lg:col-span-7 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-6 w-full flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h5 className="text-base font-bold text-slate-900 dark:text-white">Revenue won & Pipeline</h5>
                <p className="text-xs text-slate-400 mt-0.5">This month vs last</p>
              </div>

              <div className="flex items-center gap-3">
                <ul className="flex items-center gap-1 bg-slate-50 dark:bg-[var(--muted)] border dark:border-slate-800 rounded-xl p-1 text-[10px] font-bold">
                  {["weekly", "monthly", "yearly"].map((t) => (
                    <li key={t}>
                      <button
                        onClick={() => setTimeframe(t as "weekly" | "monthly" | "yearly")}
                        className={cn(
                          "py-1 px-3 rounded-lg capitalize transition-all",
                          timeframe === t
                            ? "bg-indigo-600 text-white shadow-3xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        )}
                      >
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>

                <button 
                  onClick={() => router.push("/analytics")}
                  className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="h-[240px] w-full mt-4 pr-1">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={activeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                  <XAxis dataKey="day" stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Bar dataKey="Revenue" name="Revenue Won" fill="#4f46e5" radius={[5, 5, 0, 0]} barSize={14} />
                  <Bar dataKey="Pipeline" name="Open Pipeline" fill="#60a5fa" radius={[5, 5, 0, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

      </div>


      {/* Bottom Section Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Bottom Left: Pending & Meetings (lg:col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Pending Confirmation Card */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex items-center gap-4 flex-1">
            <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-950/20 text-orange-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white leading-none mb-1">
                {stats.dealsOverview.pendingCount} deals pending
              </h4>
              <p className="text-xs text-slate-400 leading-tight">
                {stats.dealsOverview.pendingCount} deals are awaiting closing confirmation.
              </p>
            </div>
          </Card>

          {/* Upcoming Meetings Card */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex items-center gap-4 flex-1">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white leading-none mb-1">
                {upcomingMeetings.length} meetings scheduled
              </h4>
              <p className="text-xs text-slate-400 leading-tight">
                {upcomingMeetings.length} meetings are scheduled for customer follow-up.
              </p>
            </div>
          </Card>

        </div>

        {/* Bottom Right: Lead Sources / Sales by Category Donut Chart (lg:col-span-8) */}
        <div className="lg:col-span-8 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-xs w-full flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <h5 className="text-base font-bold text-slate-900 dark:text-white">Sales by Category</h5>
                <p className="text-xs text-slate-400 mt-0.5">This month vs last</p>
              </div>

              <button 
                onClick={() => router.push("/leads")}
                className="p-1.5 bg-slate-50 dark:bg-[var(--muted)] hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400"
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
              
              {/* Donut Chart Portion */}
              <div className="h-[150px] w-[150px] relative flex items-center justify-center flex-shrink-0">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={68}
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
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
                  <span className="text-xl font-black text-slate-900 dark:text-white leading-none mb-1">{topSource?.value ?? 0}%</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center max-w-[80px] truncate leading-tight">
                    {topSource?.name ? topSource.name : "—"}
                  </span>
                </div>
              </div>

              {/* Custom Legend Portion */}
              <div className="grid grid-cols-2 gap-x-12 gap-y-3 font-semibold text-xs min-w-[240px]">
                {donutData.slice(0, 6).map((d, i) => (
                  <div key={i} className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{d.name}</span>
                    </div>
                    <span className="text-slate-950 dark:text-white font-bold ml-auto">{d.value}%</span>
                  </div>
                ))}
              </div>

            </div>
          </Card>
        </div>

      </div>

    </div>
  );
}
