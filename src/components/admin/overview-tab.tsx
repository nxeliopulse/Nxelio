import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Flame,
  AlertTriangle,
  Zap,
  Meh,
  CircleCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PlatformOverviewStats,
  HotCustomerRow,
  PlatformOverviewTrendPoint,
  WorkspaceAttentionItem,
} from "@/lib/queries/platform-overview";
import { checkWorkspaceHealth } from "@/lib/queries/workspace-health";
import { Card } from "@/components/ui/card";
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
  DataTableEmpty,
} from "@/components/ui/table";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-purple-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function calculateDelta(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function Sparkline({ data, colorClass }: { data: number[]; colorClass: string }) {
  if (data.length < 2) return null;
  const width = 80;
  const height = 24;
  const padding = 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y =
        range === 0
          ? height / 2
          : height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className={colorClass}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function TrendBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  if (isPositive) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
        <TrendingUp className="h-3 w-3" />
        +{delta}%
      </span>
    );
  }
  if (isNegative) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50">
        <TrendingDown className="h-3 w-3" />
        {delta}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
      0%
    </span>
  );
}

export function OverviewTab({
  stats,
  hotCustomers,
  trendData,
  attentionWorkspaces,
}: {
  stats: PlatformOverviewStats;
  hotCustomers: HotCustomerRow[];
  trendData: PlatformOverviewTrendPoint[];
  attentionWorkspaces: WorkspaceAttentionItem[];
}) {
  const totalCustomersSeries = trendData.map((d) => d.totalCustomers);
  const activeSeries = trendData.map((d) => d.activeSubscriptions);
  const trialingSeries = trendData.map((d) => d.trialingSubscriptions);
  const mrrSeries = trendData.map((d) => d.mrrCents);

  const prevTotalCustomers = totalCustomersSeries[4] ?? 0;
  const currTotalCustomers = totalCustomersSeries[5] ?? stats.totalCustomers;
  const totalCustomersDelta = calculateDelta(currTotalCustomers, prevTotalCustomers);

  const prevActive = activeSeries[4] ?? 0;
  const currActive = activeSeries[5] ?? stats.activeSubscriptions;
  const activeDelta = calculateDelta(currActive, prevActive);

  const prevTrialing = trialingSeries[4] ?? 0;
  const currTrialing = trialingSeries[5] ?? stats.trialingSubscriptions;
  const trialingDelta = calculateDelta(currTrialing, prevTrialing);

  const prevMrr = mrrSeries[4] ?? 0;
  const currMrr = mrrSeries[5] ?? stats.mrrCents;
  const mrrDelta = calculateDelta(currMrr, prevMrr);

  const cards = [
    {
      label: "Total Customers",
      value: stats.totalCustomers.toLocaleString(),
      icon: Users,
      color:
        "text-[#18A7B8] dark:text-[#4dd6e5] bg-[#18A7B8]/10 dark:bg-[#18A7B8]/20 border border-[#18A7B8]/20 dark:border-[#18A7B8]/30",
      series: totalCustomersSeries,
      sparklineColor: "text-[#18A7B8]",
      delta: totalCustomersDelta,
    },
    {
      label: "Active Subscriptions",
      value: stats.activeSubscriptions.toLocaleString(),
      icon: TrendingUp,
      color:
        "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/50",
      series: activeSeries,
      sparklineColor: "text-emerald-500",
      delta: activeDelta,
    },
    {
      label: "Trialing",
      value: stats.trialingSubscriptions.toLocaleString(),
      icon: TrendingUp,
      color:
        "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900/50",
      series: trialingSeries,
      sparklineColor: "text-amber-500",
      delta: trialingDelta,
    },
    {
      label: "MRR",
      value: money(stats.mrrCents),
      icon: DollarSign,
      color:
        "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900/50",
      series: mrrSeries,
      sparklineColor: "text-teal-500",
      delta: mrrDelta,
    },
  ];

  // Recharts MRR Trend Data
  const chartData = trendData.map((d) => ({
    month: d.monthName,
    MRR: Math.round(d.mrrCents / 100),
  }));

  // Stacked plan breakdown
  const { pro, starter, basic, trialing, noPlan } = stats.planCounts;
  const totalBreakdown = stats.totalCustomers || 1;
  const planBreakdown = [
    { name: "Pro", count: pro, color: "bg-indigo-650 dark:bg-indigo-500", styleColor: "#4f46e5" },
    { name: "Starter", count: starter, color: "bg-sky-500 dark:bg-sky-400", styleColor: "#0ea5e9" },
    { name: "Basic", count: basic, color: "bg-teal-500 dark:bg-teal-400", styleColor: "#14b8a6" },
    { name: "Trialing", count: trialing, color: "bg-amber-500 dark:bg-amber-400", styleColor: "#f59e0b" },
    { name: "No plan", count: noPlan, color: "bg-slate-400 dark:bg-slate-500", styleColor: "#94a3b8" },
  ];

  const attentionIcons = {
    AlertTriangle: <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0" />,
    Zap: <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />,
    Meh: <Meh className="h-4 w-4 text-slate-450 flex-shrink-0" />,
  };

  const attentionBadgeStyles = {
    danger:
      "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/30",
    warning:
      "text-amber-700 dark:text-amber-455 bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/30",
    neutral:
      "text-slate-700 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800",
  };

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className="p-5 hover:border-[var(--primary)]/40 hover:shadow-md transition-all bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-start justify-between">
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.color} mb-3`}
              >
                <c.icon className="h-5 w-5" />
              </div>
              <div className="pt-2">
                <Sparkline data={c.series} colorClass={c.sparklineColor} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {c.value}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-500">
                {c.label}
              </p>
              <TrendBadge delta={c.delta} />
            </div>
          </Card>
        ))}
      </div>

      {/* 2. MRR Trend and Workspaces Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* MRR Trend Card */}
        <Card className="lg:col-span-3 p-5 bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800 flex flex-col justify-between min-h-[320px]">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              MRR Trend
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Monthly recurring revenue growth over the last 6 months.
            </p>
          </div>
          <div className="h-[200px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="mrrWave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18A7B8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#18A7B8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  stroke="#a1a1aa"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toLocaleString()}`, "MRR"]}
                  contentStyle={{
                    background: "rgba(15, 23, 42, 0.9)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "11px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="MRR"
                  stroke="#18A7B8"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#mrrWave)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Breakdown Card */}
        <Card className="lg:col-span-2 p-5 bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800 flex flex-col justify-between min-h-[320px]">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Workspaces by Plan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Distribution of workspaces across subscription tiers.
            </p>
          </div>

          <div className="my-auto py-4">
            {/* Legend List */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5">
              {planBreakdown.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${p.color}`} />
                  <span className="text-slate-550 dark:text-slate-400">{p.name}</span>
                  <span className="text-slate-900 dark:text-white font-bold">
                    {p.count}
                  </span>
                </div>
              ))}
            </div>

            {/* Horizontal Stacked Bar */}
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              {planBreakdown.map(
                (p) =>
                  p.count > 0 && (
                    <div
                      key={p.name}
                      style={{
                        width: `${(p.count / totalBreakdown) * 100}%`,
                        backgroundColor: p.styleColor,
                      }}
                      title={`${p.name}: ${p.count}`}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                    />
                  )
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-500 font-semibold">
            Total tracked workspaces:{" "}
            <span className="font-bold text-slate-700 dark:text-slate-350">
              {stats.totalCustomers}
            </span>
          </div>
        </Card>
      </div>

      {/* 3. Needs Attention Panel */}
      <Card className="p-5 bg-amber-50/30 dark:bg-amber-950/10 border-amber-100/70 dark:border-amber-900/30">
        <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 fill-amber-500/10" /> Needs
          attention
        </h3>
        {attentionWorkspaces.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-500 font-medium">
            No workspaces need attention right now.
          </div>
        ) : (
          <div className="divide-y divide-amber-100/50 dark:divide-amber-900/15 max-h-[300px] overflow-y-auto pr-1">
            {attentionWorkspaces.map((item) => (
              <div
                key={item.workspace_id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2.5">
                  {attentionIcons[item.icon]}
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-950 dark:text-white text-sm">
                        {item.workspace_name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                          attentionBadgeStyles[item.type]
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-550 dark:text-slate-500 mt-0.5 font-medium">
                      {item.reason}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4. Hot Customers Table */}
      <Card className="overflow-hidden bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/85 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500 fill-amber-500/20" /> Hot
              Customers
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              Ranked by activity &mdash; prospects imported + campaigns sent + AI credits
              consumed.
            </p>
          </div>
        </div>
        <DataTable>
          <DataTableHead>
            <tr className="text-left">
              <DataTableTh>Workspace</DataTableTh>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh>Health</DataTableTh>
              <DataTableTh className="text-right">Prospects</DataTableTh>
              <DataTableTh className="text-right">Campaigns Sent</DataTableTh>
              <DataTableTh className="text-right">Credits Used</DataTableTh>
            </tr>
          </DataTableHead>
          <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {hotCustomers.length === 0 && (
              <DataTableEmpty colSpan={6}>No activity yet.</DataTableEmpty>
            )}
            {hotCustomers.map((c) => {
              const attentionItem = checkWorkspaceHealth(c);
              let healthLabel = "Healthy";
              let healthColor =
                "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30";
              let HealthIcon = CircleCheck;

              if (attentionItem) {
                if (attentionItem.icon === "AlertTriangle") {
                  healthLabel = "Anomaly";
                  healthColor =
                    "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/30";
                  HealthIcon = AlertTriangle;
                } else if (attentionItem.icon === "Zap") {
                  healthLabel = "Fast burn";
                  healthColor =
                    "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/30";
                  HealthIcon = Zap;
                } else if (attentionItem.icon === "Meh") {
                  healthLabel = "Idle";
                  healthColor =
                    "text-slate-700 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800";
                  HealthIcon = Meh;
                }
              }

              const pct =
                c.credits_total > 0 ? (c.creditsConsumed / c.credits_total) * 100 : 0;
              const barWidth = Math.min(100, pct);

              return (
                <DataTableRow key={c.workspace_id}>
                  <DataTableTd className="font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`h-8 w-8 rounded-full ${getAvatarColor(
                          c.workspace_name
                        )} flex items-center justify-center text-white text-xs font-bold shadow-xs`}
                      >
                        {getInitials(c.workspace_name)}
                      </div>
                      <span>{c.workspace_name}</span>
                    </div>
                  </DataTableTd>
                  <DataTableTd className="text-slate-600 dark:text-slate-450 font-medium">
                    {c.plan_name}
                  </DataTableTd>
                  <DataTableTd>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold border ${healthColor}`}
                    >
                      <HealthIcon className="h-3.5 w-3.5" />
                      {healthLabel}
                    </span>
                  </DataTableTd>
                  <DataTableTd className="text-slate-900 dark:text-slate-300 text-right tabular-nums font-bold">
                    {c.leadCount.toLocaleString()}
                  </DataTableTd>
                  <DataTableTd className="text-slate-900 dark:text-slate-300 text-right tabular-nums font-bold">
                    {c.campaignsSent.toLocaleString()}
                  </DataTableTd>
                  <DataTableTd className="text-right">
                    <div className="inline-flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 text-slate-900 dark:text-white text-xs tabular-nums font-bold">
                        <span>{c.creditsConsumed.toLocaleString()}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-slate-400 font-medium">
                          {c.credits_total.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 w-24 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            pct < 50
                              ? "bg-emerald-500"
                              : pct <= 80
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                        />
                      </div>
                    </div>
                  </DataTableTd>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      </Card>
    </div>
  );
}
