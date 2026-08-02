"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, CheckCircle2, ChevronDown, Download, RefreshCw, X,
  ArrowRight, Landmark, Briefcase, Activity, Sparkles, Plus, Star, Building2, Globe, Eye
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/queries/analytics";
import type { OpportunityRow } from "@/lib/opportunities";

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
  onboardingStatus,
  recentDeals = [],
}: {
  stats: DashboardStats;
  onboardingStatus?: OnboardingStatus;
  recentDeals?: OpportunityRow[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();

  const [timeframe, setTimeframe] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("Last 30 Days");

  // Date picker dropdown options from crms.dreamstechnologies.com
  const dateRangeOptions = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
    "Custom Range"
  ];

  // Simulated collaborators array
  const collaborators = [
    { name: "Jessica Sen", initial: "JS", bg: "bg-rose-500 text-white" },
    { name: "Sharon Roy", initial: "SR", bg: "bg-teal-500 text-white" },
    { name: "Jerald Sen", initial: "JS", bg: "bg-indigo-500 text-white" },
    { name: "Ann McClure", initial: "AM", bg: "bg-orange-500 text-white" }
  ];

  // Recharts mixed bar/area data mapping
  const chartDataWeekly = [
    { day: "Mon", Revenue: 35000, Sales: 18000 },
    { day: "Tue", Revenue: 20000, Sales: 25000 },
    { day: "Wed", Revenue: 50000, Sales: 23000 },
    { day: "Thu", Revenue: 50000, Sales: 26000 },
    { day: "Fri", Revenue: 58000, Sales: 28000 },
    { day: "Sat", Revenue: 40000, Sales: 38000 }
  ];

  const chartDataMonthly = stats.leadGrowth.length > 0
    ? stats.leadGrowth.map((item) => ({
        day: item.date,
        Revenue: item.leads * 6000,
        Sales: item.leads * 3000 + item.hot * 1500
      }))
    : [
        { day: "Jan", Revenue: 30000, Sales: 20000 },
        { day: "Feb", Revenue: 45000, Sales: 28000 },
        { day: "Mar", Revenue: 50000, Sales: 22000 },
        { day: "Apr", Revenue: 35000, Sales: 25000 },
        { day: "May", Revenue: 60000, Sales: 38000 }
      ];

  const chartDataYearly = [
    { day: "2024", Revenue: 450000, Sales: 280000 },
    { day: "2025", Revenue: 580000, Sales: 350000 },
    { day: "2026", Revenue: 620000, Sales: 420000 }
  ];

  const activeChartData = timeframe === "weekly"
    ? chartDataWeekly
    : timeframe === "monthly"
      ? chartDataMonthly
      : chartDataYearly;

  // Traffic Sources static donut data from the crms.dreamstechnologies.com mockup
  const donutData = [
    { name: "Organic Search", value: 58, count: 6598, color: "#10B981" },
    { name: "Direct Traffic", value: 22, count: 2458, color: "#3B82F6" },
    { name: "Referral Traffic", value: 13, count: 1456, color: "#F59E0B" },
    { name: "Social Media", value: 7, count: 845, color: "#A855F7" }
  ];

  // Sparkline data for Total Contacts card
  const sparklineData = [
    { value: 12 },
    { value: 18 },
    { value: 15 },
    { value: 22 },
    { value: 28 },
    { value: 20 },
    { value: 25 }
  ];

  // Pipeline Statistics Card mock data
  const pipelineStats = [
    { label: "Lead", value: "$20,010", count: "80 Deals", color: "bg-rose-500" },
    { label: "Proposal", value: "$17,210", count: "23 Deals", color: "bg-amber-500" },
    { label: "Sales", value: "$9,210", count: "12 Deals", color: "bg-purple-500" },
    { label: "Won", value: "$8,210", count: "21 Deals", color: "bg-emerald-500" }
  ];

  const pipelineChartData = [
    { name: "Lead", value: 20010, fill: "#EF4444" },
    { name: "Proposal", value: 17210, fill: "#F59E0B" },
    { name: "Sales", value: 9210, fill: "#8B5CF6" },
    { name: "Won", value: 8210, fill: "#10B981" }
  ];

  const profitChartData = [
    { name: "Jan", value: 20 },
    { name: "Feb", value: 40 },
    { name: "Mar", value: 30 },
    { name: "Apr", value: 65 },
    { name: "May", value: 45 },
    { name: "Jun", value: 35 },
    { name: "Jul", value: 50 },
    { name: "Aug", value: 60 },
    { name: "Sep", value: 85 },
    { name: "Oct", value: 55 }
  ];

  // Default fallbacks for Top Deals
  const defaultTopDeals = [
    { name: "NovaWave LLC", country: "Germany", value: 1994938, initial: "NW", bg: "bg-blue-100 text-blue-600" },
    { name: "Silver Hawk", country: "Australia", value: 1544540, initial: "SH", bg: "bg-emerald-100 text-emerald-600" },
    { name: "Summit LLC", country: "Italy", value: 1036390, initial: "SU", bg: "bg-purple-100 text-purple-600" },
    { name: "Bluesky Industries", country: "Canada", value: 1015280, initial: "BI", bg: "bg-orange-100 text-orange-600" },
    { name: "HealthTech Innovations", country: "UK", value: 1014112, initial: "HT", bg: "bg-rose-100 text-rose-600" }
  ];

  // Render Top Deals based on Supabase opportunities data, falling back to mock deals
  const topDealsData = recentDeals.length > 0
    ? [...recentDeals]
        .sort((a, b) => b.deal_value - a.deal_value)
        .slice(0, 5)
        .map((d) => ({
          name: d.name,
          country: d.company || "Global",
          value: d.deal_value,
          initial: d.name.slice(0, 2).toUpperCase(),
          bg: "bg-indigo-100 text-indigo-600"
        }))
    : defaultTopDeals;

  // Default fallbacks for Recent Deals
  const defaultRecentDeals = [
    { name: "Annual Software", stage: "Appointment", value: 1994938, tag: "Rated", tagColor: "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-200", owner: "Robert Johnson", avatar: "RJ", avatarBg: "bg-rose-100 text-rose-600", probability: "90%", status: "Won", statusColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" },
    { name: "CRM Onboarding", stage: "Appointment", value: 1544540, tag: "Collab", tagColor: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200", owner: "Isabella Cooper", avatar: "IC", avatarBg: "bg-teal-100 text-teal-600", probability: "90%", status: "Lost", statusColor: "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400" },
    { name: "Enterprise Plan", stage: "Contact Made", value: 1036390, tag: "Promotion", tagColor: "text-purple-500 bg-purple-50 dark:bg-purple-950/20 border-purple-200", owner: "John Smith", avatar: "JS", avatarBg: "bg-indigo-100 text-indigo-600", probability: "80%", status: "Won", statusColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" }
  ];

  // Render Recent Deals based on Supabase opportunities data, falling back to mock deals
  const recentDealsTableData = recentDeals.length > 0
    ? recentDeals.slice(0, 5).map((d) => ({
        name: d.name,
        stage: d.stage === "meeting_scheduled" ? "Meeting Scheduled" : d.stage === "proposal_sent" ? "Proposal Sent" : d.stage.toUpperCase(),
        value: d.deal_value,
        tag: d.stage === "won" ? "Collab" : "Lead",
        tagColor: d.stage === "won" ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : "text-blue-500 bg-blue-50 dark:bg-blue-950/20 border-blue-200",
        owner: d.contact_name || "Steve Vaughan",
        avatar: (d.contact_name || "SV").slice(0, 2).toUpperCase(),
        avatarBg: "bg-sky-100 text-sky-600",
        probability: d.stage === "won" ? "100%" : d.stage === "lost" ? "0%" : "70%",
        status: d.stage === "won" ? "Won" : d.stage === "lost" ? "Lost" : "Active",
        statusColor: d.stage === "won" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" : d.stage === "lost" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400" : "bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400"
      }))
    : defaultRecentDeals;

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
                  "h-7 w-7 rounded-full border-2 border-white dark:border-[#0c0d21] flex items-center justify-center text-[10px] font-bold shadow-xs",
                  user.bg
                )}
              >
                {user.initial}
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
                        onClick={() => setTimeframe(t as any)}
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
                    {timeframe === "weekly" ? "495K" : timeframe === "monthly" ? "1.2M" : "4.8M"}
                  </h4>
                  <p className="mb-0 text-xs font-medium text-slate-400">Revenue with Sales (USD)</p>
                </div>
                
                <div className="d-flex align-items-center flex-wrap gap-2 flex items-center gap-2 text-xs font-semibold">
                  <div className="d-flex align-items-center border dark:border-slate-800 rounded px-2 py-1 flex items-center gap-1.5 bg-white dark:bg-slate-900">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-slate-600 dark:text-slate-400">Revenue</span>
                  </div>
                  <div className="d-flex align-items-center border dark:border-slate-800 rounded px-2 py-1 flex items-center gap-1.5 bg-white dark:bg-slate-900">
                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="text-slate-600 dark:text-slate-400">Sales</span>
                  </div>
                </div>
              </div>

              {/* Mixed Recharts Area & Bar Chart */}
              <div className="h-[250px] w-full mt-2 pr-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
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
                              {payload.map((p: any, i) => (
                                <div key={i} className="flex items-center gap-1.5 py-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                  <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
                                  <span className="font-bold ml-auto" style={{ color: p.color === "#EA580C" ? "#EA580C" : "inherit" }}>
                                    {money(p.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* Area representing Sales (background) */}
                    <Area
                      type="monotone"
                      dataKey="Sales"
                      name="Sales"
                      stroke="#64748b"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                    />
                    {/* Bar representing Revenue (foreground) */}
                    <Bar
                      dataKey="Revenue"
                      name="Revenue"
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

              {/* Donut Chart using Recharts Pie */}
              <div className="h-[180px] w-full relative mt-3 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
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
                
                {/* Text centered inside the donut hole */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-slate-900 dark:text-white">58%</span>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Organic</span>
                </div>
              </div>
            </div>

            {/* Legend breakdown list matching target mockup */}
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
                {stats.pipeline.wonValue > 0 ? money(stats.pipeline.wonValue) : "$15,44,540"}
              </h4>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="inline-flex items-center py-0.5 px-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                +2.5%
              </span>
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">From Last Week</p>
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
                {stats.pipeline.openCount > 0 ? formatStat(stats.pipeline.openCount) : "147"}
              </h4>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="inline-flex items-center py-0.5 px-2 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-full">
                -21.15%
              </span>
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">From Last Week</p>
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
                {stats.conversionRate > 0 ? `${stats.conversionRate}%` : "32.8%"}
              </h4>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="inline-flex items-center py-0.5 px-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                +15.5%
              </span>
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">From Last Week</p>
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
                    {stats.totalLeads > 0 ? formatStat(stats.totalLeads) : "4,569"}
                  </h4>
                  <span className="inline-flex items-center py-0.5 px-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold rounded-full">
                    +2.5%
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Total Contacts</p>
              </div>
              
              {/* Sparkline mini-bar chart on the right side of the card */}
              <div className="h-[35px] w-[65px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sparklineData}>
                    <Bar dataKey="value" fill="#EA580C" radius={[1.5, 1.5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs flex-wrap mt-auto">
              <div className="avatar-list-stacked avatar-group-sm flex -space-x-1 items-center">
                <span className="h-5 w-5 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center text-[8px] overflow-hidden">
                  <img src="assets/img/profiles/avatar-03.jpg" alt="user" className="h-full w-full object-cover" />
                </span>
                <span className="h-5 w-5 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center text-[8px] overflow-hidden">
                  <img src="assets/img/profiles/avatar-05.jpg" alt="user" className="h-full w-full object-cover" />
                </span>
                <span className="h-5 w-5 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center text-[8px] overflow-hidden">
                  <img src="assets/img/profiles/avatar-01.jpg" alt="user" className="h-full w-full object-cover" />
                </span>
                <a className="h-5 w-5 rounded-full border border-white dark:border-[#0c0d21] bg-slate-200 text-slate-700 text-[8px] font-bold flex items-center justify-center cursor-pointer" href="javascript:void(0);">
                  +4
                </a>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mb-0 font-medium">From Last Week</p>
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
              {topDealsData.map((deal, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0", deal.bg)}>
                      {deal.initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-800 dark:text-slate-200 font-bold truncate leading-none mb-1">{deal.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{deal.country}</p>
                    </div>
                  </div>
                  <p className="text-slate-900 dark:text-white font-bold">{money(deal.value)}</p>
                </div>
              ))}
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
              {pipelineStats.map((item, i) => (
                <div key={i} className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-medium mb-1 truncate">{item.label}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate mb-0.5">{item.value}</p>
                  <p className="text-[9px] text-slate-500 truncate font-semibold">{item.count}</p>
                </div>
              ))}
            </div>

            <div className="h-[75px] w-full mt-1 pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineChartData}>
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {pipelineChartData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Bottom Half: Profit Earned */}
          <Card className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden p-4 sm:p-5 flex flex-col justify-between h-[150px]">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                Profit Earned <span className="text-slate-900 dark:text-white text-sm font-black ml-1">$85K</span>
              </h5>
              <div className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold">
                2025
              </div>
            </div>

            <div className="h-[60px] w-full mt-1.5 pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitChartData}>
                  <Bar dataKey="value" fill="#EA580C" radius={[1.5, 1.5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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

            {/* Horizontal progress stacked bar */}
            <div className="flex h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden gap-0.5 mb-4">
              <div className="bg-teal-500" style={{ width: "38%" }} title="Successful" />
              <div className="bg-sky-500" style={{ width: "24%" }} title="Pending" />
              <div className="bg-amber-500" style={{ width: "23%" }} title="Referral" />
              <div className="bg-purple-500" style={{ width: "15%" }} title="Social" />
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-4 text-xs font-semibold">
              <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">2656</h4>
              <span className="inline-flex items-center py-0.5 px-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                +12.5%
              </span>
              <p className="text-slate-400 dark:text-slate-500 mb-0 font-medium">compared to last week</p>
            </div>

            {/* Breakdown detail list */}
            <div className="space-y-3 flex-1 mb-4">
              {[
                { name: "Successful Deals", count: "1000 Deals", color: "bg-teal-500" },
                { name: "Pending Deals", count: "1056 Deals", color: "bg-sky-500" },
                { name: "Rejected Deals", count: "500 Deals", color: "bg-purple-500" },
                { name: "Upcoming Deals", count: "100 Deals", color: "bg-rose-500" }
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center text-xs font-semibold pb-1.5 border-b border-slate-100 dark:border-slate-800/40 last:border-0 last:pb-0">
                  <div className="flex items-center">
                    <span className={cn("h-2 w-2 rounded-full mr-2 inline-block", item.color)} />
                    <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                  </div>
                  <span className="text-slate-900 dark:text-white font-bold">{item.count}</span>
                </div>
              ))}
            </div>

            {/* Deals won horizontal card */}
            <div className="p-3 border border-slate-150 dark:border-slate-800/80 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between text-xs font-semibold">
              <div>
                <p className="text-slate-400 dark:text-slate-500 font-medium mb-1">Deals Won</p>
                <h4 className="text-sm font-black text-slate-900 dark:text-white mb-0">689</h4>
              </div>
              <div className="avatar-group-sm flex -space-x-1.5 items-center">
                <span className="h-6 w-6 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img src="assets/img/profiles/avatar-03.jpg" alt="c1" className="h-full w-full object-cover" />
                </span>
                <span className="h-6 w-6 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img src="assets/img/profiles/avatar-05.jpg" alt="c2" className="h-full w-full object-cover" />
                </span>
                <span className="h-6 w-6 rounded-full border border-white dark:border-[#0c0d21] bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img src="assets/img/profiles/avatar-01.jpg" alt="c3" className="h-full w-full object-cover" />
                </span>
              </div>
            </div>
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
        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[700px] border border-slate-100 dark:border-slate-800">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-left border-b border-slate-100 dark:border-slate-800">
                {["Deal Name", "Stage", "Deal Value", "Tags", "Owner", "Probability", "Status"].map((h) => (
                  <th key={h} className="py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentDealsTableData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors">
                  <td className="py-2.5 px-3 truncate max-w-[150px]">{row.name}</td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{row.stage}</td>
                  <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">{money(row.value)}</td>
                  <td className="py-2.5 px-3">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border", row.tagColor)}>
                      {row.tag}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold", row.avatarBg)}>
                        {row.avatar}
                      </div>
                      <span>{row.owner}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{row.probability}</td>
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
      </Card>

    </div>
  );
}
