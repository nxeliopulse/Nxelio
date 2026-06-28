"use client";
import { useRouter } from "next/navigation";
import { Users2, Flame, MailOpen, Target, FileDown, Mouse, Calendar, Reply, BarChart3, MoreHorizontal, Download, Plus } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import type { DashboardStats } from "@/lib/queries/analytics";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iconForActivity: Record<string, React.ReactNode> = {
  page: <BarChart3 className="h-4 w-4" />,
  email: <MailOpen className="h-4 w-4" />,
  download: <FileDown className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  click: <Mouse className="h-4 w-4" />,
  webinar: <Calendar className="h-4 w-4" />,
  score: <Target className="h-4 w-4" />,
};

const iconColor: Record<string, string> = {
  page: "bg-violet-50 text-violet-600",
  email: "bg-emerald-50 text-emerald-600",
  download: "bg-purple-50 text-purple-600",
  meeting: "bg-amber-50 text-amber-600",
  click: "bg-cyan-50 text-cyan-600",
  webinar: "bg-pink-50 text-pink-600",
  score: "bg-violet-50 text-violet-600",
};

/** Polished card-style tooltip shared by both dashboard charts. */
function ChartTooltip({ active, payload, label, suffix = "" }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 px-3 py-2 shadow-lg shadow-slate-200/60 dark:shadow-black/30 backdrop-blur-sm">
      {label && <p className="mb-1.5 text-xs font-semibold text-slate-900">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
            <span className="ml-auto font-semibold text-slate-900">{p.value}{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardView({ stats }: { stats: DashboardStats }) {
  const router = useRouter();
  const { toast } = useFeedback();

  function handleExport() {
    const lines: string[] = [];
    lines.push("Metric,Value");
    lines.push(`Total leads,${stats.totalLeads}`);
    lines.push(`Hot leads,${stats.hotLeads}`);
    lines.push(`Avg. open rate,${stats.avgOpenRate}%`);
    lines.push(`Conversion rate,${stats.conversionRate}%`);
    lines.push(`Emails sent,${stats.snapshot.emailsSent}`);
    lines.push(`Replies received,${stats.snapshot.repliesReceived}`);
    lines.push(`AI scored,${stats.snapshot.aiScored}`);
    lines.push("");
    lines.push("Month,Leads,Hot leads");
    for (const m of stats.leadGrowth) lines.push(`${csvCell(m.date)},${m.leads},${m.hot}`);
    lines.push("");
    lines.push("Campaign,Open %,Reply %");
    for (const c of stats.campaignPerf) lines.push(`${csvCell(c.name)},${c.openRate},${c.replyRate}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Dashboard report exported", "success");
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back!</h1>
          <p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening across your campaigns today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export report
          </Button>
          <Button onClick={() => router.push("/campaigns/builder")}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={stats.totalLeads.toLocaleString()} delta={stats.leadsDelta} icon={<Users2 className="h-4.5 w-4.5" />} accent="blue" />
        <KpiCard label="Hot Leads" value={stats.hotLeads} icon={<Flame className="h-4.5 w-4.5" />} accent="amber" />
        <KpiCard label="Avg. Open Rate" value={`${stats.avgOpenRate}%`} icon={<MailOpen className="h-4.5 w-4.5" />} accent="emerald" />
        <KpiCard label="Conversion Rate" value={`${stats.conversionRate}%`} icon={<Target className="h-4.5 w-4.5" />} accent="purple" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Lead Growth</CardTitle>
              <p className="text-sm text-slate-500 mt-0.5">Monthly leads captured + hot leads</p>
            </div>
            <select className="text-sm border border-slate-200 rounded-md px-2.5 py-1.5">
              <option>Last 5 months</option>
              <option>Last year</option>
            </select>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.leadGrowth} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
                      <stop offset="85%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gHot" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                      <stop offset="85%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f0f0f7" strokeDasharray="4 4" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#d8b4fe", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="#7c3aed" strokeWidth={2.75} fill="url(#gLeads)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                  <Area type="monotone" dataKey="hot" name="Hot leads" stroke="#f59e0b" strokeWidth={2.75} fill="url(#gHot)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Performance</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">Top 5 active</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.campaignPerf} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barGap={4} barCategoryGap={18}>
                  <defs>
                    <linearGradient id="bOpen" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id="bReply" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#e9e3fb" />
                      <stop offset="100%" stopColor="#c4b5fd" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={false} stroke="#f0f0f7" strokeDasharray="4 4" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={76} />
                  <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ fill: "rgba(124,58,237,0.05)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="openRate" fill="url(#bOpen)" radius={[0, 6, 6, 0]} name="Open %" barSize={12} />
                  <Bar dataKey="replyRate" fill="url(#bReply)" radius={[0, 6, 6, 0]} name="Reply %" barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity feed + Quick stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm">View all</Button>
          </CardHeader>
          <CardContent className="p-0">
            {stats.recentActivities.length === 0 ? (
              <p className="p-5 text-sm text-slate-500 text-center">No activity yet. Activity will appear here as leads engage.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.recentActivities.map((a) => (
                  <li key={a.id} className="px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor[a.type] || iconColor.page}`}>
                      {iconForActivity[a.type] || iconForActivity.page}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{a.lead}</span> <span className="text-slate-600">{a.action}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{a.time}</p>
                    </div>
                    <button className="p-1.5 rounded-md hover:bg-slate-100">
                      <MoreHorizontal className="h-4 w-4 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Emails sent", value: stats.snapshot.emailsSent.toLocaleString(), icon: <MailOpen className="h-4 w-4" />, color: "text-violet-600 bg-violet-50" },
                { label: "Replies received", value: stats.snapshot.repliesReceived.toLocaleString(), icon: <Reply className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50" },
                { label: "Hot leads", value: stats.snapshot.hotLeads.toLocaleString(), icon: <Flame className="h-4 w-4" />, color: "text-amber-600 bg-amber-50" },
                { label: "AI scored", value: stats.snapshot.aiScored.toLocaleString(), icon: <Target className="h-4 w-4" />, color: "text-purple-600 bg-purple-50" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${row.color}`}>{row.icon}</div>
                    <span className="text-sm text-slate-700">{row.label}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hot Lead Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.hotLeadAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No hot leads yet.</p>
              ) : (
                stats.hotLeadAlerts.map((l) => (
                  <div key={l.name} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold flex items-center justify-center">
                      {l.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{l.name}</p>
                      <p className="text-xs text-slate-500 truncate">{l.company}</p>
                    </div>
                    <Badge variant="warning">{l.score}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
