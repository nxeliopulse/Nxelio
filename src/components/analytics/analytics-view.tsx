"use client";
import { useState, useTransition } from "react";
import { Calendar, Download, Mail, Mouse, MessageCircle } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { getAnalyticsStatsRanged, getAnalyticsStatsCustom } from "@/lib/queries/analytics";

interface Stats {
  emailsSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  funnel: { stage: string; value: number }[];
  engagement: { day: string; opens: number; clicks: number; replies: number }[];
  leadGrowth: { date: string; leads: number; hot: number }[];
  campaignPerf: { name: string; openRate: number; replyRate: number }[];
}

const funnelColors = ["#3b82f6", "#06b6d4", "#f59e0b", "#10b981", "#8b5cf6"];

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function AnalyticsView({ stats: initialStats }: { stats: Stats }) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [selectedRange, setSelectedRange] = useState<string>("30");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDates, setCustomDates] = useState<{ start: string; end: string }>({
    start: todayStr(),
    end: todayStr(),
  });
  const [isPending, startTransition] = useTransition();

  const maxFunnel = Math.max(1, ...stats.funnel.map((f) => f.value));

  function handleRangeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setSelectedRange(v);
    startTransition(async () => {
      const next = v === "year"
        ? await getAnalyticsStatsRanged("year")
        : await getAnalyticsStatsRanged(Number(v));
      setStats(next);
    });
  }

  function handleApplyCustom() {
    startTransition(async () => {
      const next = await getAnalyticsStatsCustom(customDates.start, customDates.end);
      setStats(next);
      setCustomOpen(false);
    });
  }

  function handleExport() {
    const rows: string[] = [];
    rows.push("Summary");
    rows.push("Label,Value");
    rows.push(`Emails Sent,${csvEscape(stats.emailsSent)}`);
    rows.push(`Open Rate,${csvEscape(stats.openRate + "%")}`);
    rows.push(`Click Rate,${csvEscape(stats.clickRate + "%")}`);
    rows.push(`Reply Rate,${csvEscape(stats.replyRate + "%")}`);
    rows.push("");
    rows.push("Campaign Comparison");
    rows.push("Campaign,Open%,Reply%");
    for (const c of stats.campaignPerf) {
      rows.push(`${csvEscape(c.name)},${csvEscape(c.openRate)},${csvEscape(c.replyRate)}`);
    }
    rows.push("");
    rows.push("Conversion Funnel");
    rows.push("Stage,Count");
    for (const f of stats.funnel) {
      rows.push(`${csvEscape(f.stage)},${csvEscape(f.value)}`);
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadpro-analytics-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Analytics"
        description="Campaign performance, conversion funnel & engagement insights"
        actions={
          <>
            <Select
              className="max-w-[160px]"
              value={selectedRange}
              onChange={handleRangeChange}
              disabled={isPending}
            >
              <option value="30">Last 30 days</option>
              <option value="7">Last 7 days</option>
              <option value="90">Last 90 days</option>
              <option value="year">This year</option>
            </Select>
            <Button variant="outline" onClick={() => setCustomOpen(true)} disabled={isPending}>
              <Calendar className="h-4 w-4" /> Custom range
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Emails sent", value: stats.emailsSent.toLocaleString(), icon: <Mail className="h-4 w-4" />, color: "bg-blue-50 text-blue-600" },
          { label: "Open rate", value: `${stats.openRate}%`, icon: <Mail className="h-4 w-4" />, color: "bg-emerald-50 text-emerald-600" },
          { label: "Click rate", value: `${stats.clickRate}%`, icon: <Mouse className="h-4 w-4" />, color: "bg-indigo-50 text-indigo-600" },
          { label: "Reply rate", value: `${stats.replyRate}%`, icon: <MessageCircle className="h-4 w-4" />, color: "bg-amber-50 text-amber-600" },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">{s.label}</p>
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Engagement over time</h3>
          <p className="text-sm text-slate-500 mb-4">Opens, clicks, and replies — last 7 days</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.engagement}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="opens" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="clicks" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Conversion funnel</h3>
          <p className="text-sm text-slate-500 mb-4">All leads · current month</p>
          <div className="space-y-2">
            {stats.funnel.map((s, i) => {
              const pct = (s.value / maxFunnel) * 100;
              const prev = i > 0 ? stats.funnel[i - 1].value : null;
              const conv = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700 font-medium">{s.stage}</span>
                    <span className="font-semibold text-slate-900">{s.value.toLocaleString()}</span>
                  </div>
                  <div className="h-7 bg-slate-100 rounded-md overflow-hidden flex items-center">
                    <div className="h-full rounded-md flex items-center justify-end px-2 flex-shrink-0" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: funnelColors[i % funnelColors.length] }}>
                      {pct >= 12 && <span className="text-xs font-semibold text-white">{pct.toFixed(1)}%</span>}
                    </div>
                    {pct < 12 && <span className="text-xs font-semibold text-slate-600 px-2">{pct.toFixed(1)}%</span>}
                  </div>
                  {conv && <p className="text-xs text-slate-500 mt-0.5">{conv}% from prev stage</p>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Campaign comparison</h3>
          <p className="text-sm text-slate-500 mb-4">Performance across top campaigns</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.campaignPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="openRate" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Open %" />
                <Bar dataKey="replyRate" fill="#10b981" radius={[6, 6, 0, 0]} name="Reply %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Lead growth</h3>
          <p className="text-sm text-slate-500 mb-4">New leads + hot lead conversions</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.leadGrowth}>
                <defs>
                  <linearGradient id="ga1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="leads" stroke="#2563eb" strokeWidth={2.5} fill="url(#ga1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
        description="Pick a start and end date to filter analytics"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Start date</label>
            <input
              type="date"
              value={customDates.start}
              max={customDates.end}
              onChange={(e) => setCustomDates((d) => ({ ...d, start: e.target.value }))}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">End date</label>
            <input
              type="date"
              value={customDates.end}
              min={customDates.start}
              max={todayStr()}
              onChange={(e) => setCustomDates((d) => ({ ...d, end: e.target.value }))}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCustomOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleApplyCustom} disabled={isPending || !customDates.start || !customDates.end}>
              {isPending ? "Applying..." : "Apply"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
