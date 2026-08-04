"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, CheckCircle2, ChevronDown, Download, RefreshCw, X,
  ArrowRight, Landmark, Briefcase, Activity, Sparkles,
  TrendingUp, TrendingDown, Wallet, CreditCard, Users, Trophy,
  MoreVertical, FileText, Check, Laptop, Globe, Smartphone, Shirt, Home
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
  credits = { used: 0, total: 1500, planId: "free", status: "trialing", trialEndsAt: null },
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10 px-4 sm:px-6 text-slate-800 dark:text-slate-700">
      
      {/* Welcome Banner */}
      <Suspense fallback={null}>
        <WelcomeBanner />
      </Suspense>

      {/* Dashboard Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
        <div>
          <h4 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h4>
          <p className="text-xs text-slate-500 mt-1 font-semibold">Real-time overview of your pipeline, lead sources, and team meetings.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Overlapping collaborators avatar list */}
          <div className="flex -space-x-1.5 items-center mr-3">
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

          {/* Daterangepicker */}
          <div className="relative">
            <button
              onClick={() => setDateRangeOpen(!dateRangeOpen)}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs mr-2 hover:bg-slate-50 dark:hover:bg-slate-800"
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
                      activeDateRange === opt ? "text-[#696cff] bg-indigo-50/50 dark:bg-indigo-950/20" : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export / Download */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="p-2 shadow-2xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg gap-1 h-8 w-8 justify-center flex items-center mr-2"
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
              setTimeout(() => window.location.reload(), 100);
            }}
            className="p-2 shadow-2xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg h-8 w-8 justify-center flex items-center"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {/* Row 1: Sneat-Style Congratulations Banner & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Welcome Card (2/3 width) */}
        <div className="lg:col-span-8 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-5 flex flex-col sm:flex-row items-center justify-between w-full overflow-hidden min-h-[175px]">
            <div className="space-y-3 flex-1">
              <h5 className="text-base font-bold text-[#696cff] dark:text-indigo-400">Congratulations {userName}! 🎉</h5>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                You have completed onboarding and have <span className="font-extrabold text-slate-800 dark:text-white">{stats.pipeline.openCount} active deals</span> in your pipeline today. Check your performance metrics below.
              </p>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#e7e7ff] text-[#696cff] dark:bg-indigo-950/40 dark:text-indigo-300">
                72% progress completed
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => router.push("/opportunities")}
                  className="bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-semibold px-4 py-2 rounded-lg"
                >
                  View Opportunities
                </Button>
              </div>
            </div>
            
            {/* Sneat illustrative graphic */}
            <div className="flex-shrink-0 mt-4 sm:mt-0">
              <svg width="180" height="130" viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="max-w-full">
                {/* Desk Base */}
                <rect x="10" y="115" width="180" height="4" rx="2" fill="#e2e8f0" />
                
                {/* Laptop */}
                <rect x="70" y="80" width="60" height="38" rx="4" fill="#696cff" fillOpacity="0.8" />
                <rect x="74" y="84" width="52" height="28" rx="2" fill="#ffffff" />
                {/* Laptop Keyboard base */}
                <path d="M62 118L138 118C141 118 143 120 143 123C143 124 141 125 138 125H62C59 125 57 124 57 123C57 120 59 118 62 118Z" fill="#5f61e6" />
                
                {/* Laptop screen graphics */}
                <circle cx="100" cy="98" r="8" fill="#e7e7ff" />
                <path d="M96 98L99 101L104 96" stroke="#696cff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Plant details */}
                <rect x="155" y="90" width="10" height="25" rx="1" fill="#ffab00" fillOpacity="0.7" />
                <path d="M160 90C160 80 152 75 152 75C152 75 160 82 160 90Z" fill="#71dd37" />
                <path d="M160 90C160 80 168 75 168 75C168 75 160 82 160 90Z" fill="#71dd37" />
                
                {/* Developer Character */}
                <circle cx="100" cy="40" r="16" fill="#ffe2d1" /> {/* Head */}
                <path d="M84 40C84 25 116 25 116 40C116 43 114 45 112 45C108 45 106 38 100 38C94 38 92 45 88 45C86 45 84 43 84 40Z" fill="#2d3748" /> {/* Hair */}
                {/* Eye brow & glasses */}
                <circle cx="94" cy="40" r="4.5" stroke="#696cff" strokeWidth="1.5" />
                <circle cx="106" cy="40" r="4.5" stroke="#696cff" strokeWidth="1.5" />
                <path d="M98.5 40H101.5" stroke="#696cff" strokeWidth="1.5" />
                {/* Body */}
                <path d="M80 75C80 62 120 62 120 75V115H80V75Z" fill="#696cff" />
                {/* Hands typing */}
                <path d="M72 95C72 90 82 90 84 95L88 102H68L72 95Z" fill="#ffe2d1" />
                <path d="M128 95C128 90 118 90 116 95L112 102H132L128 95Z" fill="#ffe2d1" />
              </svg>
            </div>
          </Card>
        </div>
        
        {/* Order/Contacts Card (1/6 width) */}
        <div className="lg:col-span-2 sm:col-span-6 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-col justify-between w-full min-h-[175px]">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-lg bg-[#e8fadf] text-[#71dd37] flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-slate-400 font-semibold text-[10px] uppercase">Contacts</div>
            </div>
            
            <div className="mt-4">
              <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Total Registered</span>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{formatStat(stats.totalLeads)}</h4>
            </div>

            {/* Sparkline line chart */}
            <div className="h-[30px] w-full mt-2">
              <ResponsiveContainer width="100%" height={30}>
                <LineChart data={stats.contactsSparkline.map((v) => ({ value: v }))}>
                  <Line type="monotone" dataKey="value" stroke="#71dd37" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Sales/Won Card (1/6 width) */}
        <div className="lg:col-span-2 sm:col-span-6 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-col justify-between w-full min-h-[175px]">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center flex-shrink-0">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="text-slate-400 font-semibold text-[10px] uppercase">Sales</div>
            </div>
            
            <div className="mt-4">
              <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Revenue Won</span>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{money(stats.pipeline.wonValue)}</h4>
            </div>

            <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-[#71dd37] bg-[#e8fadf] px-1.5 py-0.5 rounded w-fit">
              <TrendingUp className="h-3 w-3" />
              <span>+{stats.conversionRate}%</span>
            </div>
          </Card>
        </div>

      </div>

      {/* Row 2: Total Revenue Chart & Secondary Sparklines */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Total Revenue Card with integrated Recharts double-bars & Radial win rate gauge */}
        <div className="lg:col-span-8 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800/80 w-full">
            
            {/* Left Portion: Vertical Bar Chart */}
            <div className="flex-1 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  Total Revenue Won & Pipeline
                </h5>
                <ul className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 rounded-lg p-1 text-[10px] font-semibold">
                  {["weekly", "monthly", "yearly"].map((t) => (
                    <li key={t}>
                      <button
                        onClick={() => setTimeframe(t as "weekly" | "monthly" | "yearly")}
                        className={cn(
                          "py-0.5 px-2 rounded capitalize transition-all",
                          timeframe === t
                            ? "bg-[#696cff] text-white shadow-3xs"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        )}
                      >
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Legend & Summary */}
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{money(activeChartTotal)}</h4>
                  <p className="text-[10px] text-slate-400">Total Value ({timeframe})</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-semibold">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#696cff]" />
                    <span className="text-slate-500">Won</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#03c3ec]" />
                    <span className="text-slate-500">Pipeline</span>
                  </div>
                </div>
              </div>

              <div className="h-[220px] w-full mt-2 pr-2">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={activeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                    <XAxis dataKey="day" stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Bar dataKey="Revenue" name="Revenue Won" fill="#696cff" radius={[3, 3, 0, 0]} barSize={12} />
                    <Bar dataKey="Pipeline" name="Open Pipeline" fill="#03c3ec" radius={[3, 3, 0, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Right Portion: Radial Gauge */}
            <div className="w-full md:w-[220px] p-5 flex flex-col justify-between items-center bg-slate-50/20 dark:bg-slate-900/10">
              <div className="w-full flex justify-between items-center text-xs mb-3">
                <span className="font-bold text-slate-900 dark:text-white">2026</span>
                <span className="text-slate-400 font-semibold cursor-pointer hover:text-slate-600">Details &gt;</span>
              </div>

              {/* Pie semi-circle gauge */}
              <div className="h-[100px] w-full relative flex items-center justify-center overflow-hidden">
                <ResponsiveContainer width="100%" height={100}>
                  <PieChart>
                    <Pie
                      data={[
                        { value: stats.pipeline.winRate, color: "#696cff" },
                        { value: Math.max(0, 100 - stats.pipeline.winRate), color: "#f5f5f9" }
                      ]}
                      cx="50%"
                      cy="100%"
                      innerRadius={48}
                      outerRadius={65}
                      startAngle={180}
                      endAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#696cff" />
                      <Cell fill="#e1e2e6" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
                  <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{stats.pipeline.winRate}%</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Win Rate</span>
                </div>
              </div>

              <div className="w-full text-center mt-3">
                <p className="text-[10px] font-bold text-slate-500">62% Company Growth</p>
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-left">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Won Opportunities</span>
                    <span className="text-xs font-black text-slate-950 dark:text-white">{money(stats.pipeline.wonValue)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Open Pipeline</span>
                    <span className="text-xs font-black text-slate-950 dark:text-white">{money(stats.pipeline.openValue)}</span>
                  </div>
                </div>
              </div>
            </div>

          </Card>
        </div>

        {/* Right Column: Stacked mini-cards */}
        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
          
          {/* PayPal Payments Card */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-col justify-between min-h-[140px]">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-lg bg-[#fff2d6] text-[#ffab00] flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="text-slate-400 font-semibold text-[10px] uppercase">Pending Payments</div>
            </div>
            
            <div className="mt-2">
              <span className="text-[10px] font-semibold text-slate-400 block">Deals Pending</span>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{money(stats.dealsOverview.pendingValue)}</h4>
            </div>

            <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-[#ffab00] bg-[#fff2d6] px-1.5 py-0.5 rounded w-fit">
              <span>{stats.dealsOverview.pendingCount} deals</span>
            </div>
          </Card>

          {/* Revenue Sparkline Bar Card */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-col justify-between min-h-[140px]">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-lg bg-[#d7f5fc] text-[#03c3ec] flex items-center justify-center flex-shrink-0">
                <Landmark className="h-5 w-5" />
              </div>
              <div className="text-slate-400 font-semibold text-[10px] uppercase">Open Value</div>
            </div>

            <div className="mt-2">
              <span className="text-[10px] font-semibold text-slate-400 block">Pipeline Value</span>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{money(stats.pipeline.openValue)}</h4>
            </div>

            {/* Sparkline bar chart */}
            <div className="h-[25px] w-full mt-1.5">
              <ResponsiveContainer width="100%" height={25}>
                <BarChart data={stats.contactsSparkline.map((v) => ({ value: v }))}>
                  <Bar dataKey="value" fill="#03c3ec" radius={[1.5, 1.5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Profile Report card with orange sparkline (spans 2 columns) */}
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs col-span-1 sm:col-span-2 flex items-center justify-between min-h-[100px]">
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Profile Performance</span>
              <div className="flex items-center gap-1.5">
                <h4 className="text-lg font-bold text-slate-900 dark:text-white leading-none">{money(stats.pipeline.wonValue)}</h4>
                <span className="text-[9px] font-bold text-[#71dd37] bg-[#e8fadf] px-1.5 py-0.5 rounded">Year 2026</span>
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold text-[#71dd37]">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+68.2% Growth metrics</span>
              </div>
            </div>
            
            {/* Sparkline orange wave chart */}
            <div className="h-[40px] w-[100px] flex-shrink-0">
              <ResponsiveContainer width={100} height={40}>
                <LineChart data={activeChartData}>
                  <Line type="monotone" dataKey="Revenue" stroke="#ffab00" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

        </div>

      </div>

      {/* Row 3: Breakdown & Income Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Order Statistics (Donut Breakdown) */}
        <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs flex flex-col justify-between min-h-[380px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Order Statistics
              </h5>
              <span className="text-[10px] font-semibold text-slate-400">Weekly</span>
            </div>
            
            <p className="text-[10px] font-semibold text-slate-400 mb-1">Total Contacts: {formatStat(stats.totalLeads)}</p>
            
            <div className="h-[160px] w-full relative flex items-center justify-center mt-3">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={70}
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
                <span className="text-lg font-black text-slate-900 dark:text-white leading-none mb-1">{topSource?.value ?? 0}%</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider max-w-[85px] text-center leading-tight">
                  {topSource?.name ? topSource.name : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/50">
            {donutData.slice(0, 4).map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-500">{d.name}</span>
                </div>
                <span className="text-slate-900 dark:text-white font-bold">{formatStat(d.count)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Total Income Smooth Wave */}
        <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs flex flex-col justify-between min-h-[380px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Total Income
              </h5>
              <div className="flex gap-2 text-[10px] font-semibold bg-slate-50 dark:bg-slate-900 p-1 border dark:border-slate-800 rounded">
                <span className="px-1.5 py-0.5 bg-[#696cff] text-white rounded">Income</span>
                <span className="px-1.5 py-0.5 text-slate-500">Expenses</span>
              </div>
            </div>

            <div className="space-y-1 mt-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Total Income Won</p>
              <div className="flex items-center gap-2">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">{money(stats.pipeline.wonValue)}</h4>
                <span className="text-[9px] font-bold text-[#71dd37] bg-[#e8fadf] px-1.5 py-0.5 rounded">+42.9%</span>
              </div>
            </div>

            {/* Smooth Wave area chart */}
            <div className="h-[180px] w-full mt-4 pr-1">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={activeChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <defs>
                    <linearGradient id="incomeWave" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#696cff" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#696cff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Area type="monotone" dataKey="Revenue" stroke="#696cff" strokeWidth={2.5} fillOpacity={1} fill="url(#incomeWave)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/50 flex items-center gap-2.5 text-[10px] font-semibold text-slate-500">
            <div className="h-6 w-6 rounded-full bg-[#e8fadf] text-[#71dd37] flex items-center justify-center flex-shrink-0">
              <Trophy className="h-3.5 w-3.5" />
            </div>
            <span>Income this week: {money(stats.pipeline.wonValue / 4)} won metrics.</span>
          </div>
        </Card>

        {/* Transactions/Opportunities List */}
        <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs flex flex-col justify-between min-h-[380px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-3">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Transactions
              </h5>
              <button onClick={() => router.push("/opportunities")} className="text-slate-400 hover:text-slate-600">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 mt-4">
              {recentDealsTableData.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">No recent transactions / deals found.</p>
              ) : (
                recentDealsTableData.slice(0, 5).map((deal, idx) => (
                  <div key={deal.id} className="flex justify-between items-center text-xs font-semibold">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold",
                        idx % 3 === 0 ? "bg-[#e8fadf] text-[#71dd37]" : idx % 3 === 1 ? "bg-[#e7e7ff] text-[#696cff]" : "bg-[#fff2d6] text-[#ffab00]"
                      )}>
                        {deal.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-800 dark:text-white font-bold truncate leading-none mb-1">{deal.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium truncate">{deal.contact}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-950 dark:text-white font-bold mb-0.5">{money(deal.value)}</p>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", deal.statusColor)}>
                        {deal.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => router.push("/opportunities")}
            className="w-full mt-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-[#696cff] hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-center block"
          >
            View All Transactions &gt;
          </button>
        </Card>

      </div>

      {/* Row 4: Timeline & Metrics Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Activity Timeline Card */}
        <div className="lg:col-span-8 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs w-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-4">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Activity Timeline
              </h5>
              <span className="text-[10px] font-semibold text-slate-400">Recent outreach & events</span>
            </div>

            <div className="relative pl-6 border-l border-slate-100 dark:border-slate-800 space-y-6 ml-2 text-xs font-semibold">
              
              {/* Timeline Item 1: Meetings */}
              <div className="relative">
                <div className="absolute -left-[30px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1b212e] bg-[#696cff] flex items-center justify-center" />
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-slate-800 dark:text-white font-bold leading-none mb-0">Teammate Collaboration Meetings</p>
                  <span className="text-[9px] text-slate-400 font-medium">Scheduled Today</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mb-2.5">Teammate meetings and calendar coordination events.</p>
                
                {upcomingMeetings.length === 0 ? (
                  <p className="text-[10px] text-slate-400 font-medium">No meetings scheduled for today.</p>
                ) : (
                  <div className="space-y-2 bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 p-3 rounded-lg max-w-md">
                    {upcomingMeetings.slice(0, 2).map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-slate-800 dark:text-white font-bold truncate leading-tight">{m.title}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">{new Date(m.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        {m.join_url && (
                          <a href={m.join_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-rose-50 dark:bg-rose-950/20 text-[#696cff] rounded text-[9px] font-bold flex-shrink-0 hover:underline">
                            Join Link
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline Item 2: Onboarding */}
              <div className="relative">
                <div className="absolute -left-[30px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1b212e] bg-[#71dd37]" />
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-slate-800 dark:text-white font-bold leading-none mb-0">Onboarding Gate Verification</p>
                  <span className="text-[9px] text-slate-400 font-medium">Essentials Done</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  {onboardingStatus?.essentialsDone ? "Essentials onboarding steps completed successfully." : "Incomplete onboarding steps detected."}
                </p>
              </div>

              {/* Timeline Item 3: Credit limits */}
              <div className="relative">
                <div className="absolute -left-[30px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1b212e] bg-[#ffab00]" />
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-slate-800 dark:text-white font-bold leading-none mb-0">AI Credits Usage limits</p>
                  <span className="text-[9px] text-slate-400 font-medium">{formatStat(credits.total - credits.used)} remaining</span>
                </div>
                <div className="w-full max-w-sm bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 border border-slate-200 dark:border-slate-800 mt-1.5">
                  <div className="bg-[#ffab00] h-1 rounded-full" style={{ width: `${credits.total > 0 ? Math.min(100, Math.round((credits.used / credits.total) * 100)) : 0}%` }} />
                </div>
              </div>

            </div>
          </Card>
        </div>

        {/* Browser Progress Card */}
        <div className="lg:col-span-4 flex">
          <Card className="bg-white dark:bg-[#1b212e] border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-xs w-full flex flex-col justify-between min-h-[280px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/85 mb-4">
                <h5 className="text-sm font-bold text-slate-900 dark:text-white">Lead Source Share</h5>
                <span className="text-[10px] font-semibold text-slate-400">Breakdown %</span>
              </div>

              <div className="space-y-4 text-xs font-semibold">
                {donutData.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">No lead sources found.</p>
                ) : (
                  donutData.slice(0, 5).map((source) => (
                    <div key={source.name} className="space-y-1.5">
                      <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                          <span>{source.name}</span>
                        </div>
                        <span className="font-bold">{source.value}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 border border-slate-200 dark:border-slate-800">
                        <div className="h-1.5 rounded-full" style={{ width: `${source.value}%`, backgroundColor: source.color }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => router.push("/leads")}
              className="w-full mt-5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-center block"
            >
              Analyze Sources &gt;
            </button>
          </Card>
        </div>

      </div>

    </div>
  );
}
