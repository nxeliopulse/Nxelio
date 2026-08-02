"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDown, ArrowUpRight, BarChart2, Bell,
  ChevronDown, Clock, Download, DollarSign, Eye, EyeOff,
  FileText, Flame, GitBranch, Globe, GripVertical,
  Lightbulb, Mail, MailOpen, MoreHorizontal, RefreshCw,
  Reply, RotateCcw, Search, Settings2, Target, TrendingUp,
  Trophy, Users, X, Zap, CheckCircle2, Bot, MessageSquare,
  Sparkles, Terminal, Code2, Play, Layers, Send, AlertCircle, HelpCircle
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ComposedChart, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip,
  Treemap, XAxis, YAxis, ZAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { getAnalyticsStatsRanged, getAnalyticsStatsCustom } from "@/lib/queries/analytics";
import type { AnalyticsStats } from "@/lib/queries/analytics";

// ── Design Tokens (Nxelio Brand Style) ──────────────────────────────────────────
const BG           = "#F3F5F9"; // Light Background
const WHITE        = "#FFFFFF";
const BORDER       = "#DDDBDA"; // Nxelio Border
const TEXT         = "#080707"; // Nxelio Dark Text
const MUTED        = "#514F4D"; // Nxelio Slate Text
const SOFT         = "#817E7B"; // Nxelio Medium Gray
const BRAND_BLUE   = "#0176D3"; // Brand Blue
const BRAND_BLUE_BG = "#E0F0FD"; // Light blue highlights
const PILL_BG      = "#032D5B"; // Dark Brand Blue
const GRID_C       = "#EDEDED";
const TICK_C       = "#706E6B";

// Chart palette (Teal & Sky Blue spectrum)
const PAL = [
  "#0176D3", // Brand Blue
  "#52B7D8", // Sky Blue
  "#34BEC2", // Teal
  "#E077AE", // Rose
  "#FF9A52", // Amber/Peach
  "#7C3AED", // Violet
  "#2E7D32", // Success Green
  "#EA580C"  // Orange
];

const DOW  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOUR = Array.from({length:24},(_,i)=>i===0?"12a":i<12?`${i}a`:i===12?"12p":`${i-12}p`);

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(n:number):string{if(n>=1e6)return`$${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`$${(n/1e3).toFixed(1)}K`;return`$${n}`;}
function fmt(n:number):string{if(n>=1e6)return`${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`${(n/1e3).toFixed(1)}K`;return String(n);}
function today(){return new Date().toISOString().slice(0,10);}
function csv(v:string|number){const s=String(v);return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}

// ── Filter Options ─────────────────────────────────────────────────────────────
const REGIONS = ["All", "East", "West", "North", "South"];
const OWNERS = ["All", "Alex Rivera (AE)", "Sarah Chen (AE)", "Marcus Vance (AE)", "Emma Patel (SDR)"];
const INDUSTRIES = ["All", "Technology", "Healthcare", "Finance", "Retail", "Manufacturing"];
const LEAD_SOURCES = ["All", "Web", "Email", "Content", "Events", "Outbound", "Direct"];
const STAGES = ["All", "New", "Qualified", "Meeting Booked", "Proposal Sent", "Negotiation", "Won", "Lost"];

interface FilterState {
  range: string;
  region: string;
  owner: string;
  industry: string;
  leadSource: string;
  stage: string;
}

const DEFAULT_FILTERS: FilterState = {
  range: "30",
  region: "All",
  owner: "All",
  industry: "All",
  leadSource: "All",
  stage: "All"
};

// ── IQL (Insight Query Language) Mock Definitions ──────────────────────────────
const IQL_QUERIES: Record<string, string> = {
  overview: `q = load "Overall_Sales_and_Engagement";\nq = filter q by 'Owner' == "All";\nq = filter q by 'Region' == "All";\nq = group q by 'CloseDate_Month';\nq = foreach q generate 'CloseDate_Month' as 'Month', sum('Amount') as 'Revenue';\nq = order q by 'Month' asc;\nq = limit 100;`,
  pipeline: `q = load "Opportunities_Pipeline";\nq = filter q by 'IsClosed' == "false";\nq = group q by 'StageName';\nq = foreach q generate 'StageName' as 'Stage', sum('Amount') as 'Total_Value', count() as 'Deal_Count';\nq = order q by 'Total_Value' desc;`,
  revenue: `q = load "Sales_Revenue_Forecast";\nq = filter q by 'CloseDate' in ["Current Fiscal Quarter"];\nq = group q by 'Owner';\nq = foreach q generate 'Owner' as 'Rep', sum('Amount') as 'Closed_Won_Amount', sum('Quota') as 'Quota_Amount';\nq = order q by 'Closed_Won_Amount' desc;`,
  campaigns: `q = load "Email_Campaign_Performance";\nq = group q by 'CampaignName';\nq = foreach q generate 'CampaignName' as 'Campaign', avg('OpenRate') as 'Avg_Open', avg('ReplyRate') as 'Avg_Reply';\nq = order q by 'Avg_Open' desc;`,
  activity: `q = load "Activity_History_Logs";\nq = group q by 'ActivityType';\nq = foreach q generate 'ActivityType' as 'Type', count() as 'Activity_Count';\nq = order q by 'Activity_Count' desc;`,
  accounts: `q = load "Account_Health_Analytics";\nq = group q by 'AccountHealth';\nq = foreach q generate 'AccountHealth' as 'Score_Bucket', count() as 'Accounts_Count';`
};

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tip({active,payload,label}:{active?:boolean;label?:string;payload?:Array<{name?:string;value?:number|string;color?:string}>}){
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#1A2536",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",fontSize:13,minWidth:120,color:"#FFF",boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
      {label&&<p className="font-bold text-slate-200 mb-1 border-b border-slate-700 pb-1">{label}</p>}
      {payload.map((p,i)=>(
        <div key={i} className="flex items-center gap-2 mb-1">
          <span style={{width:7,height:7,borderRadius:"50%",background:p.color??"#0176D3",flexShrink:0}}/>
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-bold text-white ml-auto pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
function Heatmap({data}:{data:number[][]}){
  const max=Math.max(...data.flat(),1);
  return(
    <div className="select-none p-2">
      <div className="flex pl-8 mb-1">
        {HOUR.map((h,i)=><div key={i} className="flex-1 text-center" style={{fontSize:11,color:SOFT}}>{i%4===0?h:""}</div>)}
      </div>
      {data.map((row,d)=>(
        <div key={d} className="flex items-center mb-0.5">
          <span className="w-7 text-right pr-1" style={{fontSize:11,color:SOFT}}>{DOW[d]}</span>
          {row.map((v,h)=>{
            const t=v/max;
            return<div key={h} title={`${v} · ${DOW[d]} ${HOUR[h]}`} className="flex-1 h-5 transition-all hover:scale-105"
              style={{background:v===0?"#F3F5F9":`rgba(1, 118, 211, ${0.1+t*0.9})`,margin:"0 1px",borderRadius:2}}/>;
          })}
        </div>
      ))}
      <div className="flex items-center gap-1.5 justify-end mt-2">
        <span style={{fontSize:11,color:SOFT}}>Less</span>
        {[0,.2,.4,.6,.8,1].map((v,i)=><div key={i} className="w-4 h-3 rounded-sm" style={{background:v===0?"#F3F5F9":`rgba(1, 118, 211, ${0.1+v*0.9})`}}/>)}
        <span style={{fontSize:11,color:SOFT}}>More</span>
      </div>
    </div>
  );
}

// ── Treemap ────────────────────────────────────────────────────────────────────
function TreeContent(p:{x?:number;y?:number;width?:number;height?:number;name?:string;value?:number;index?:number}){
  const{x=0,y=0,width=0,height=0,name,value,index=0}=p;
  const c=PAL[index%PAL.length];
  if(width<20||height<20)return null;
  return(<g>
    <rect x={x+2} y={y+2} width={width-4} height={height-4} rx={6} fill={`${c}18`} stroke={`${c}aa`} strokeWidth={1.5}/>
    {width>55&&height>35&&<>
      <text x={x+width/2} y={y+height/2-5} textAnchor="middle" fill={TEXT} fontSize={12} fontWeight={700}>{name}</text>
      <text x={x+width/2} y={y+height/2+8} textAnchor="middle" fill={MUTED} fontSize={10}>{fmtK(value??0)}</text>
    </>}
  </g>);
}

// ── Nxelio Speedometer Gauge ───────────────────────────────────────────────────
function NxelioGauge({ value, label, sub, type = "percentage" }: { value: number; label: string; sub: string; type?: "percentage" | "coverage" | "velocity" }) {
  const maxVal = type === "coverage" ? 5 : type === "velocity" ? 90 : 100;
  const pct = Math.min(Math.max((value / maxVal) * 100, 0), 100);
  const rotation = (pct / 100) * 180 - 90; // -90deg to +90deg
  
  // Color bands representing ranges (red -> yellow -> green)
  const isVelocity = type === "velocity";
  const rColor = isVelocity ? "#34D399" : "#F87171"; // Lower velocity is better (green)
  const gColor = isVelocity ? "#F87171" : "#34D399"; // Higher velocity is worse (red)
  
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-[#DDDBDA] shadow-xs relative overflow-hidden h-[170px] transition-transform hover:-translate-y-0.5">
      <div className="w-40 h-28">
        {/* SVG Arc Gauge */}
        <svg viewBox="0 0 100 68" className="w-full h-full">
          {/* Background track */}
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#EEF0F5" strokeWidth="9" strokeLinecap="round" />
          
          {/* Colored segmented ranges */}
          {/* Lower Range */}
          <path d="M 10 50 A 40 40 0 0 1 30 15.36" fill="none" stroke={rColor} strokeWidth="9" />
          {/* Mid Range */}
          <path d="M 30 15.36 A 40 40 0 0 1 70 15.36" fill="none" stroke="#FBBF24" strokeWidth="9" />
          {/* High Range */}
          <path d="M 70 15.36 A 40 40 0 0 1 90 50" fill="none" stroke={gColor} strokeWidth="9" />

          {/* Actual Value Outline Indicator */}
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={BRAND_BLUE} strokeWidth="2.5" strokeDasharray="125.6" strokeDashoffset={125.6 - (pct / 100) * 125.6} strokeLinecap="round" />

          {/* Needle pointer */}
          <line x1="50" y1="50" x2="50" y2="16" stroke="#1E293B" className="stroke-slate-800" strokeWidth="3" strokeLinecap="round"
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "50px 50px",
              transition: "transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }}
          />

          {/* Needle center pin */}
          <circle cx="50" cy="50" r="5" fill="#1E293B" className="fill-slate-800" />
          <circle cx="50" cy="50" r="2" fill="#FFF" className="fill-white" />

          {/* Value Text */}
          <text x="50" y="66" textAnchor="middle" fontSize="13" fontWeight="900" fill="#1E293B" className="fill-slate-800 font-sans tracking-tight">
            {type === "percentage" ? `${value}%` : type === "coverage" ? `${value}x` : `${value}d`}
          </text>
        </svg>
      </div>
      <div className="text-center mt-1">
        <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-slate-400 font-bold uppercase">{sub}</span>
      </div>
    </div>
  );
}

// ── Stage pill ─────────────────────────────────────────────────────────────────
const PILL:Record<string,string>={
  "Won":"background:#ECFDF5;color:#15803D;border:1px solid #BBF7D0",
  "Lost":"background:#FFF1F2;color:#B91C1C;border:1px solid #FECDD3",
  "Qualified":"background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE",
  "New":"background:#F3F4F6;color:#374151;border:1px solid #E5E7EB",
  "Meeting Booked":"background:#ECFEFF;color:#0E7490;border:1px solid #CFFAFE",
  "Proposal Sent":"background:#F5F3FF;color:#6D28D9;border:1px solid #DDD6FE",
  "Negotiation":"background:#FFFBEB;color:#B45309;border:1px solid #FEF3C7",
};
function SPill({s}:{s:string}){
  const st=PILL[s]??"background:#F3F4F6;color:#374151;border:1px solid #E5E7EB";
  return<span className="px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs" style={Object.fromEntries(st.split(";").map(p=>{const[k,v]=p.split(":");return[k.trim(),v?.trim()??""]}))}>{s}</span>;
}

// ── White card ─────────────────────────────────────────────────────────────────
interface CardP {
  title?:string;icon?:React.ReactNode;badge?:string;extra?:React.ReactNode;children:React.ReactNode;
  noPad?:boolean;customizing?:boolean;dragging?:boolean;dragOver?:boolean;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
  onDragEnd?:()=>void;onHide?:()=>void;className?:string;
  onFacetClear?: () => void;
  facetActive?: boolean;
}
function WCard({title,icon,badge,extra,children,noPad,customizing,dragging,dragOver,onDragStart,onDragOver,onDrop,onDragEnd,onHide,className,onFacetClear,facetActive}:CardP){
  return(
    <div
      draggable={customizing}
      onDragStart={onDragStart}
      onDragOver={e=>{e.preventDefault();onDragOver?.(e);}}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn("rounded-2xl border transition-all duration-150 relative bg-white shadow-xs hover:shadow-md",dragOver?"ring-2 ring-[#0176D3] ring-offset-1":"",dragging?"opacity-40":"",facetActive?"ring-2 ring-indigo-500/70":"",className)}
      style={{borderColor:dragOver?"#0176D3":BORDER}}
    >
      {title&&(
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#DDDBDA] bg-slate-50/50">
          <div className="flex items-center gap-2 min-w-0">
            {customizing&&<GripVertical size={14} style={{color:SOFT,flexShrink:0}}/>}
            {icon&&<span style={{color:BRAND_BLUE}}>{icon}</span>}
            <h3 className="text-sm font-bold truncate text-slate-800 tracking-tight">{title}</h3>
            {badge&&<span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-[#0176D3] border border-blue-100">{badge}</span>}
            {facetActive&&<span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 border border-indigo-200 rounded-md font-bold animate-pulse">FACET FILTER ACTIVE</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {extra}
            {facetActive&&onFacetClear&&(
              <button onClick={onFacetClear} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 mr-2 cursor-pointer">
                <X size={10}/>Clear
              </button>
            )}
            {customizing&&onHide&&(
              <button onClick={onHide} className="p-1 rounded transition-colors text-slate-400 hover:text-red-500 cursor-pointer">
                <EyeOff size={13}/>
              </button>
            )}
            {!customizing&&<button className="p-1 rounded text-slate-400 hover:text-slate-600"><MoreHorizontal size={14}/></button>}
          </div>
        </div>
      )}
      <div className={noPad?"":customizing?"p-5 pointer-events-none":"p-5"}>{children}</div>
    </div>
  );
}

// ── Panel system ───────────────────────────────────────────────────────────────
type TabId = "overview"|"pipeline"|"revenue"|"campaigns"|"activity"|"accounts";
type PanelId = string;
type PanelSpan = "full"|"half"|"third";

interface PMeta { title:string; span:PanelSpan; icon:React.ReactNode; }
const PM: Record<PanelId,PMeta> = {
  "ov-combo":    {title:"Overall Sales & Engagement", span:"full",  icon:<TrendingUp size={13}/>},
  "ov-donut":    {title:"Revenue Split",              span:"half",  icon:<BarChart2 size={13}/>},
  "ov-leads":    {title:"Recent Prospect Streams",        span:"half",  icon:<Users size={13}/>},
  "ov-opps":     {title:"Top Open Opportunities",     span:"full",  icon:<Trophy size={13}/>},
  "ov-insights": {title:"AI Predictive Insights",     span:"half",  icon:<Zap size={13}/>},
  "ov-activity": {title:"Activity Logs Feed",         span:"half",  icon:<Activity size={13}/>},

  "pi-stages":   {title:"Pipeline Stages Funnel",     span:"full",  icon:<GitBranch size={13}/>},
  "pi-aging":    {title:"Opportunity Aging Pipeline", span:"half",  icon:<Clock size={13}/>},
  "pi-value":    {title:"Value distributed by Stage", span:"half",  icon:<DollarSign size={13}/>},
  "pi-opps":     {title:"Opportunities List Table",   span:"full",  icon:<Trophy size={13}/>},

  "rv-forecast": {title:"Sales Performance Forecast vs Quota",span:"full",icon:<TrendingUp size={13}/>},
  "rv-winloss":  {title:"Win / Loss Reason Analysis",  span:"half",  icon:<BarChart2 size={13}/>},
  "rv-sources":  {title:"Revenue distribution by Source",span:"half",icon:<Globe size={13}/>},
  "rv-treemap":  {title:"Pipeline Distribution Hierarchy",span:"full",icon:<BarChart2 size={13}/>},

  "ca-bars":     {title:"Campaign Conversion Comparison",span:"full",icon:<Mail size={13}/>},
  "ca-radar":    {title:"Channel Performance Radar Map",span:"half", icon:<Activity size={13}/>},
  "ca-scatter":  {title:"Email Efficiency Bubble Chart",span:"half", icon:<Zap size={13}/>},
  "ca-stacked":  {title:"Daily Campaign Email Activity",span:"full",  icon:<BarChart2 size={13}/>},
  "ca-leader":   {title:"Campaign Performance Leaderboard",span:"full",icon:<Trophy size={13}/>},

  "ac-heatmap":  {title:"Sales Activity Calendar Heatmap",span:"full",icon:<Clock size={13}/>},
  "ac-pie":      {title:"Total Activity Type Breakdown",span:"half",  icon:<Activity size={13}/>},
  "ac-trend":    {title:"7-Day Activity Volatility Trend",span:"half",icon:<TrendingUp size={13}/>},
  "ac-bars":     {title:"Volume distribution by Type", span:"full",  icon:<BarChart2 size={13}/>},

  "aa-health":   {title:"Account Relationship Health",span:"half",  icon:<Activity size={13}/>},
  "aa-sources":  {title:"Prospect Source Channel Audit",   span:"half",  icon:<Globe size={13}/>},
  "aa-score":    {title:"Prospect Score Value Spread",    span:"full",  icon:<Target size={13}/>},
  "aa-mix":      {title:"Interactivity Mix Allocation",span:"full",  icon:<MailOpen size={13}/>},
};

const DEFAULT_PANELS: Record<TabId,PanelId[]> = {
  overview:  ["ov-combo","ov-donut","ov-leads","ov-opps","ov-insights","ov-activity"],
  pipeline:  ["pi-stages","pi-aging","pi-value","pi-opps"],
  revenue:   ["rv-forecast","rv-winloss","rv-sources","rv-treemap"],
  campaigns: ["ca-bars","ca-radar","ca-scatter","ca-stacked","ca-leader"],
  activity:  ["ac-heatmap","ac-pie","ac-trend","ac-bars"],
  accounts:  ["aa-health","aa-sources","aa-score","aa-mix"],
};

interface PanelCfg{order:Record<TabId,PanelId[]>;hidden:PanelId[];}
function loadCfg():PanelCfg{
  try{const r=typeof window!=="undefined"?localStorage.getItem("nx-v2-cfg"):null;if(r)return JSON.parse(r);}catch{}
  return{order:{...DEFAULT_PANELS} as Record<TabId,PanelId[]>,hidden:[]};
}
function saveCfg(c:PanelCfg){try{localStorage.setItem("nx-v2-cfg",JSON.stringify(c));}catch{}}

// ── AI Discovery Insights helper ────────────────────────────────────────────────
const ICLR:Record<string,string>={positive:"#15803D",info:"#0176D3",attention:"#B45309",warning:"#B91C1C"};
// Tailwind class pairs (light+dark) for the insight card background/border —
// kept separate from the inline-style IBCG/IBRD maps above because inline
// `style` colors can't respond to `dark:` and render unreadable under forced
// dark-mode browser extensions.
const IBG_CLASS:Record<string,string>={
  positive:  "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
  info:      "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
  attention: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
  warning:   "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
};

function computeAIInsights(s:AnalyticsStats){
  const r:Array<{type:string;icon:React.ReactNode;title:string;body:string;recommendation:string}>=[];
  
  if(s.quotaAttainment>=85) {
    r.push({
      type:"positive",
      icon:<Trophy size={13}/>,
      title:`High Quota Attainment (${s.quotaAttainment}%)`,
      body:"Sales reps closing deals are outperforming their quotas in the target territories this month.",
      recommendation: "Increase territory quotas by 15% for next fiscal cycle or expand budget for top pipelines."
    });
  } else {
    r.push({
      type:"warning",
      icon:<Target size={13}/>,
      title:`Critical: Quota Gap Alert (${s.quotaAttainment}% attained)`,
      body:"The overall won revenue is trailing target quota due to a longer deal velocity (average 42 days).",
      recommendation: "Run a target incentive play on all Opportunities in 'Negotiation' stage with values above $10k."
    });
  }

  r.push({
    type:"attention",
    icon:<Clock size={13}/>,
    title:`Opportunity Aging Pipeline (${s.dealVelocity} days avg)`,
    body:"Deals in the 'Proposal Sent' stage are stalled. Average time in stage has risen by 12% week-over-week.",
    recommendation: "Auto-trigger follow-up sequence via AI Copilot on all opportunities stalled > 14 days."
  });

  if(s.hotLeads>0) {
    r.push({
      type:"positive",
      icon:<Flame size={13}/>,
      title:`Unassigned High-Score Leads (${s.hotLeads} Hot Leads)`,
      body:`There are ${s.hotLeads} leads in status 'Hot' with scores over 80 that have had no outreach in 7 days.`,
      recommendation: "Assign these immediately to high-tier AE reps using Lead Router playbooks."
    });
  }

  const top=[...s.campaignPerf].sort((a,b)=>b.openRate-a.openRate)[0];
  if(top) {
    r.push({
      type:"info",
      icon:<Zap size={13}/>,
      title:`Campaign Driver: ${top.name}`,
      body:`Outstanding open rate of ${top.openRate}% and reply rate of ${top.replyRate}% recorded.`,
      recommendation: "Clone this email subject line template pattern for the upcoming summer campaigns."
    });
  }

  return r.slice(0, 4);
}

// ── Client-side Global & Facet Filtering Engine ────────────────────────────────
function getFilteredStats(base: AnalyticsStats, f: FilterState, facet: { type: string; value: string } | null): AnalyticsStats {
  const s = JSON.parse(JSON.stringify(base)) as AnalyticsStats;
  
  // Calculate coefficients based on filters to scale numeric fields consistently
  let scale = 1.0;
  if (f.region !== "All") scale *= 0.25;
  if (f.owner !== "All") scale *= 0.2;
  if (f.industry !== "All") scale *= 0.25;
  
  // If facet filter is active, apply additional filters/coefficients
  if (facet) {
    scale *= 0.4;
  }

  // Apply scale to metrics
  s.totalLeads = Math.round(s.totalLeads * scale);
  s.hotLeads = Math.round(s.hotLeads * scale);
  s.convertedLeads = Math.round(s.convertedLeads * scale);
  s.emailsSent = Math.round(s.emailsSent * scale);
  s.pipelineTotal = Math.round(s.pipelineTotal * scale);
  s.wonRevenue = Math.round(s.wonRevenue * scale);
  s.avgDealValue = Math.round(s.avgDealValue * (0.95 + Math.random() * 0.1));
  s.quotaTarget = Math.round(s.quotaTarget * scale);
  
  // Recalculate Quota Attainment
  s.quotaAttainment = s.quotaTarget > 0 ? Math.min(Math.round((s.wonRevenue / s.quotaTarget) * 100), 100) : 0;
  s.pipelineCoverage = s.quotaTarget > 0 ? Math.round((s.pipelineTotal / s.quotaTarget) * 10) / 10 : 1.2;

  // Apply Global Filters to specific attributes
  if (f.stage !== "All" || (facet && facet.type === "stage")) {
    const activeStage = facet && facet.type === "stage" ? facet.value : f.stage;
    const match = s.pipelineByStage.find(x => x.stage.toLowerCase() === activeStage.toLowerCase());
    s.pipelineTotal = match ? match.value : 0;
    s.topOpportunities = s.topOpportunities.filter(o => o.stage.toLowerCase() === activeStage.toLowerCase());
  }

  if (f.leadSource !== "All" || (facet && facet.type === "source")) {
    const activeSource = facet && facet.type === "source" ? facet.value : f.leadSource;
    const srcMatch = s.leadSources.find(x => x.source.toLowerCase() === activeSource.toLowerCase());
    s.totalLeads = srcMatch ? srcMatch.leads : Math.round(s.totalLeads * 0.3);
    s.convertedLeads = srcMatch ? srcMatch.converted : Math.round(s.convertedLeads * 0.3);
    s.wonRevenue = srcMatch ? srcMatch.value : Math.round(s.wonRevenue * 0.3);
    s.pipelineTotal = Math.round(s.pipelineTotal * 0.35);
  }

  // Filter topOpportunities based on filters (simulated names/text attributes append)
  s.topOpportunities = s.topOpportunities.map((o, idx) => {
    let name = o.name;
    if (f.region !== "All") name += ` (${f.region})`;
    if (f.owner !== "All") name += ` - ${f.owner.split(" ")[0]}`;
    return { ...o, name };
  });

  // Scale chart series data points to be consistent with metrics
  s.engagement = s.engagement.map(e => ({
    ...e,
    opens: Math.round(e.opens * scale),
    clicks: Math.round(e.clicks * scale),
    replies: Math.round(e.replies * scale),
  }));

  s.leadGrowth = s.leadGrowth.map(g => ({
    ...g,
    leads: Math.round(g.leads * scale),
    hot: Math.round(g.hot * scale),
  }));

  s.pipelineByStage = s.pipelineByStage.map(p => ({
    ...p,
    count: Math.round(p.count * scale),
    value: Math.round(p.value * scale),
  }));

  s.forecastMonths = s.forecastMonths.map(m => ({
    ...m,
    quota: Math.round(m.quota * scale),
    actual: Math.round(m.actual * scale),
    forecast: Math.round(m.forecast * scale),
  }));

  s.opportunityAging = s.opportunityAging.map(a => ({
    ...a,
    count: Math.round(a.count * scale),
    value: Math.round(a.value * scale),
  }));

  s.stageConversion = s.stageConversion.map(c => ({
    ...c,
    count: Math.round(c.count * scale),
  }));

  s.leadSources = s.leadSources.map(l => ({
    ...l,
    leads: Math.round(l.leads * scale),
    converted: Math.round(l.converted * scale),
    value: Math.round(l.value * scale),
  }));

  s.activityBreakdown = s.activityBreakdown.map(a => ({
    ...a,
    count: Math.round(a.count * scale),
  }));

  s.winLossReasons = s.winLossReasons.map(r => ({
    ...r,
    won: Math.round(r.won * scale),
    lost: Math.round(r.lost * scale),
  }));

  s.accountHealthDist = s.accountHealthDist.map(h => ({
    ...h,
    count: Math.round(h.count * scale),
  }));

  s.leadScoreDist = s.leadScoreDist.map(h => ({
    ...h,
    count: Math.round(h.count * scale),
  }));

  // Re-adjust stats arrays length for high/low data
  if (scale < 0.5) {
    s.topOpportunities = s.topOpportunities.slice(0, Math.max(3, Math.round(s.topOpportunities.length * scale * 2)));
    s.campaignPerf = s.campaignPerf.slice(0, Math.max(4, Math.round(s.campaignPerf.length * scale * 2)));
  }

  return s;
}

// ── Main Page Component ────────────────────────────────────────────────────────
export function AnalyticsView({stats:initial}:{stats:AnalyticsStats}){
  const [stats,        setStats]        = useState(initial);
  const [tab,          setTab]          = useState<TabId>("overview");
  const [filters,      setFilters]      = useState<FilterState>(DEFAULT_FILTERS);
  const [facet,        setFacet]        = useState<{ type: string; value: string } | null>(null);
  
  const [loading,      setLoading]      = useState(false);
  const [customOpen,   setCustomOpen]   = useState(false);
  const [customStart,  setCustomStart]  = useState("");
  const [customEnd,    setCustomEnd]    = useState(today());
  
  const [customizing,  setCustomizing]  = useState(false);
  const [showReport,   setShowReport]   = useState(false);
  const [cfg,          setCfg]          = useState<PanelCfg>(loadCfg);
  const [dragging,     setDragging]     = useState<string|null>(null);
  const [dragOver,     setDragOver]     = useState<string|null>(null);
  
  // Analytics Advanced Features States
  const [iqlMode,      setIqlMode]      = useState(false);
  const [iqlQuery,     setIqlQuery]     = useState(IQL_QUERIES.overview);
  const [iqlError,     setIqlError]     = useState<string | null>(null);
  const [presentMode,  setPresentMode]  = useState(false);
  const [viewsOpen,    setViewsOpen]    = useState(false);
  const [savedViews,   setSavedViews]   = useState<Array<{ name: string; filters: FilterState }>>([
    { name: "Default Analytics View", filters: DEFAULT_FILTERS },
    { name: "West Coast Tech Opportunities", filters: { ...DEFAULT_FILTERS, region: "West", industry: "Technology" } },
    { name: "High Value Campaign Outbound", filters: { ...DEFAULT_FILTERS, leadSource: "Outbound", owner: "Alex Rivera (AE)" } }
  ]);
  const [activeViewName, setActiveViewName] = useState("Default Analytics View");

  // Nxelio Copilot Chatbot States
  const [chatOpen,     setChatOpen]     = useState(false);
  const [chatInput,    setChatInput]    = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "copilot"; text: string; data?: unknown }>>([
    { sender: "copilot", text: "Hello! I am your Nxelio Nurture Copilot. You can ask me to filter data, calculate metrics, or summarize insights. Try selecting one of the queries below!" }
  ]);

  const prevRange=useRef(filters.range);

  useEffect(()=>{saveCfg(cfg);},[cfg]);

  // Sync IQL query when switching tabs
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs derived query text whenever the active tab changes
    setIqlQuery(IQL_QUERIES[tab] || IQL_QUERIES.overview);
  }, [tab]);

  useEffect(()=>{
    if(prevRange.current===filters.range)return;
    prevRange.current=filters.range;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opens the custom-range modal when that option is selected
    if(filters.range==="custom"){setCustomOpen(true);return;}
    setLoading(true);
    getAnalyticsStatsRanged(Number(filters.range)).then(setStats).finally(()=>setLoading(false));
  },[filters.range]);

  async function applyCustom(){
    if(!customStart||!customEnd)return;
    setCustomOpen(false);setLoading(true);
    try{setStats(await getAnalyticsStatsCustom(customStart,customEnd));}finally{setLoading(false);}
  }

  function exportCSV(){
    const rows=[
      ["Emails Sent",s.emailsSent],["Open Rate %",s.openRate],["Reply Rate %",s.replyRate],
      ["Total Prospects",s.totalLeads],["Hot Prospects",s.hotLeads],["Pipeline",s.pipelineTotal],
      ["Won Revenue",s.wonRevenue],["Win Rate %",s.winRate],["Quota %",s.quotaAttainment],
    ];
    const c=[["Metric","Value"],...rows].map(r=>r.map(csv).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([c],{type:"text/csv"}));
    a.download=`nxelio-analytics-${today()}.csv`;a.click();
  }

  // IQL Compilation/Runner Simulation
  function runIQL() {
    setLoading(true);
    setIqlError(null);
    setTimeout(() => {
      try {
        const lines = iqlQuery.split(";").map(l => l.trim()).filter(Boolean);
        const newFilters = { ...filters };
        let hasFilters = false;

        for (const line of lines) {
          if (line.includes("filter q by")) {
            // E.g. filter q by 'Region' == "West"
            const match = line.match(/filter\s+q\s+by\s+'(\w+)'\s*==\s*"([^"]+)"/i);
            if (match) {
              const [, field, val] = match;
              const normalizedField = field.toLowerCase();
              if (normalizedField === "region" && REGIONS.includes(val)) {
                newFilters.region = val;
                hasFilters = true;
              }
              if (normalizedField === "owner") {
                const rep = OWNERS.find(o => o.startsWith(val));
                if (rep) { newFilters.owner = rep; hasFilters = true; }
              }
              if (normalizedField === "industry" && INDUSTRIES.includes(val)) {
                newFilters.industry = val;
                hasFilters = true;
              }
              if (normalizedField === "stage" && STAGES.includes(val)) {
                newFilters.stage = val;
                hasFilters = true;
              }
              if (normalizedField === "leadsource" && LEAD_SOURCES.includes(val)) {
                newFilters.leadSource = val;
                hasFilters = true;
              }
            }
          }
        }

        if (hasFilters) {
          setFilters(newFilters);
          setChatMessages(prev => [
            ...prev,
            { sender: "copilot", text: "⚡ **Insight Query compiled successfully!** Evaluated query and applied the specified dimension filters to the workspace dashboards." }
          ]);
        } else {
          setChatMessages(prev => [
            ...prev,
            { sender: "copilot", text: "⚡ **Insight query run successfully** (No recognized filter conditions found. Rendered default layout projections)." }
          ]);
        }
      } catch (err) {
        setIqlError(err instanceof Error ? err.message : "Syntax Error: Unrecognized token on Insight Query projection pipeline.");
      } finally {
        setLoading(false);
      }
    }, 600);
  }

  // Handle Copilot Natural Language commands
  function handleCopilotMessage(msgText: string) {
    if (!msgText.trim()) return;
    const userMsg = msgText.trim();
    setChatMessages(prev => [...prev, { sender: "user", text: userMsg }]);
    setChatInput("");

    setLoading(true);
    setTimeout(() => {
      const lower = userMsg.toLowerCase();
      let responseText = "";
      const currentFiltered = getFilteredStats(stats, filters, facet);

      if (lower.includes("won") || lower.includes("revenue")) {
        responseText = `Based on your current filter criteria, the **Closed Won Revenue** is **${fmtK(currentFiltered.wonRevenue)}** against a target quota of **${fmtK(currentFiltered.quotaTarget)}** (${currentFiltered.quotaAttainment}% attainment).`;
      } else if (lower.includes("win rate")) {
        responseText = `The current **Sales Win Rate** stands at **${currentFiltered.winRate}%** across all closed opportunities in this period.`;
      } else if (lower.includes("filter to") || lower.includes("show only") || lower.includes("region") || lower.includes("owner")) {
        // Attempt to extract filters
        const newFilters = { ...filters };
        let found = false;

        for (const r of REGIONS) {
          if (lower.includes(r.toLowerCase())) {
            newFilters.region = r;
            responseText += `Applied regional filter **${r}**. `;
            found = true;
          }
        }
        for (const o of OWNERS) {
          const namePart = o.split(" ")[0].toLowerCase();
          if (lower.includes(namePart)) {
            newFilters.owner = o;
            responseText += `Assigned owner filter to **${o}**. `;
            found = true;
          }
        }
        for (const s of STAGES) {
          if (lower.includes(s.toLowerCase())) {
            newFilters.stage = s;
            responseText += `Set stage status filter to **${s}**. `;
            found = true;
          }
        }

        if (found) {
          setFilters(newFilters);
          responseText += "\n\nThe dashboard visuals have been updated automatically to reflect these dimensions.";
        } else {
          responseText = "I heard your request to filter the data, but I couldn't identify the specific dimension values. Try naming a region (e.g. *West*), owner (e.g. *Alex*), or stage (e.g. *Negotiation*).";
        }
      } else if (lower.includes("velocity") || lower.includes("days open")) {
        responseText = `Our average **Deal Velocity** is **${currentFiltered.dealVelocity} days**. Lower velocity represents faster conversion cycles from Qualification to Close.`;
      } else {
        responseText = "I've analyzed the active dataset. Your pipeline coverage is stable at **" + currentFiltered.pipelineCoverage + "x**. Would you like me to run a predictive forecast for next quarter or filter by an opportunity owner?";
      }

      setChatMessages(prev => [...prev, { sender: "copilot", text: responseText }]);
      setLoading(false);
    }, 700);
  }

  // Active dataset with all filters and facets applied
  const filteredStats = getFilteredStats(stats, filters, facet);
  
  const s = filteredStats;
  
  function getPanels(t:TabId):PanelId[]{
    return(cfg.order[t]??DEFAULT_PANELS[t]).filter(id=>!cfg.hidden.includes(id));
  }
  function hidePanel(id:PanelId){setCfg(p=>({...p,hidden:[...p.hidden,id]}));}
  function showPanel(id:PanelId){setCfg(p=>({...p,hidden:p.hidden.filter(h=>h!==id)}));}
  function resetLayout(){
    setCfg({order:{...DEFAULT_PANELS} as Record<TabId,PanelId[]>,hidden:[]});
    setCustomizing(false);
    setFilters(DEFAULT_FILTERS);
    setFacet(null);
  }

  function handleDrop(t:TabId,overId:string){
    if(!dragging||dragging===overId){setDragging(null);setDragOver(null);return;}
    setCfg(prev=>{
      const base=prev.order[t]??DEFAULT_PANELS[t];
      const order=[...base];
      const from=order.indexOf(dragging),to=order.indexOf(overId);
      if(from===-1||to===-1)return prev;
      order.splice(from,1);order.splice(to,0,dragging);
      return{...prev,order:{...prev.order,[t]:order}};
    });
    setDragging(null);setDragOver(null);
  }

  const attColor=s.quotaAttainment>=80?"#2E7D32":s.quotaAttainment>=50?"#ED6C02":"#D32F2F";
  const insights = computeAIInsights(s);
  
  // Custom definitions for lists
  const mixData=[
    {name:"Opens",  value:s.engagement.reduce((a,e)=>a+e.opens,0),  fill:PAL[0]},
    {name:"Clicks", value:s.engagement.reduce((a,e)=>a+e.clicks,0), fill:PAL[1]},
    {name:"Replies",value:s.engagement.reduce((a,e)=>a+e.replies,0),fill:PAL[2]},
  ];
  const totalMix=mixData.reduce((a,d)=>a+d.value,0);
  const actPie=s.activityBreakdown.map((a,i)=>({...a,fill:PAL[i%PAL.length]}));
  const radar=[
    {m:"Open Rate",  v:Math.min(s.openRate,100)},
    {m:"Click Rate", v:Math.min(s.clickRate*5,100)},
    {m:"Reply Rate", v:Math.min(s.replyRate*5,100)},
    {m:"Win Rate",   v:Math.min(s.winRate,100)},
    {m:"Hot Lead %", v:s.totalLeads>0?Math.min((s.hotLeads/s.totalLeads)*100,100):0},
    {m:"Conversion", v:Math.min(s.winRate*1.2,100)},
  ];
  const scatter=s.campaignPerf.map(c=>({x:c.openRate,y:c.replyRate,z:Math.max(c.sent||50,20),name:c.name}));
  const treemap=s.pipelineByStage.filter(x=>x.value>0).map(x=>({name:x.stage,size:x.value}));
  const agingC=["#2E7D32","#06B6D4","#ED6C02","#D32F2F","#7C0E0E"];
  const hlthC=["#D32F2F","#ED6C02","#06B6D4","#2E7D32"];
  const topCamps=[...s.campaignPerf].sort((a,b)=>b.openRate-a.openRate).slice(0,6);
  const openOpps=s.pipelineByStage.filter(x=>!["Won","Lost"].includes(x.stage));

  // Render chart dashboards based on panel IDs
  function renderContent(id:PanelId,s:AnalyticsStats,onViewReport?:()=>void):React.ReactNode{
    const convRate=s.totalLeads>0?((s.convertedLeads/s.totalLeads)*100).toFixed(1):"0.0";
    switch(id){
      case "ov-combo": return(
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-0.5 text-slate-400">Sales Engagement Volume</p>
              <p className="text-2xl font-black text-slate-800">{fmt(s.emailsSent)} <span className="text-sm font-semibold text-slate-400">emails sent</span></p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:PAL[0]}}/> Opens</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:PAL[1]}}/> Clicks</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:PAL[4]}}/> Replies</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={s.engagement} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
              <XAxis dataKey="day" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="opens" name="Opens" fill={`${PAL[0]}15`} stroke={PAL[0]} strokeWidth={1} radius={[4,4,0,0]}/>
              <Line type="monotone" dataKey="clicks"  name="Clicks"  stroke={PAL[1]} strokeWidth={2.5} dot={{r:4,fill:PAL[1],strokeWidth:1}} activeDot={{r:6}}/>
              <Line type="monotone" dataKey="replies" name="Replies" stroke={PAL[4]} strokeWidth={2.5} dot={{r:4,fill:PAL[4],strokeWidth:1}} activeDot={{r:6}}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );

      case "ov-donut": return(
        <div className="flex items-center gap-6">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={mixData} cx="50%" cy="50%" innerRadius={46} outerRadius={70} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                  {mixData.map((d,i)=>(
                    <Cell 
                      key={i} 
                      fill={d.fill} 
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      onClick={() => setFacet({ type: "source", value: d.name })}
                    />
                  ))}
                </Pie>
                <Tooltip content={<Tip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-800">{fmt(totalMix)}</span>
              <span className="text-xs font-bold text-slate-400 uppercase">events</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {mixData.map((d,i)=>{
              const pct=totalMix>0?Math.round((d.value/totalMix)*100):0;
              return(
                <div key={i} className="cursor-pointer" onClick={() => setFacet({ type: "source", value: d.name })}>
                  <div className="flex justify-between mb-1 text-xs">
                    <span className="font-bold text-slate-700">{d.name}</span>
                    <span className="font-black text-slate-800">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.max(pct,2)}%`,background:d.fill}}/>
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-[#DDDBDA]">
              <button onClick={onViewReport} className="w-full py-2 rounded-xl text-xs font-bold text-white transition-all bg-[#0176D3] hover:bg-[#005FB2] shadow-xs cursor-pointer">View Data Details</button>
            </div>
          </div>
        </div>
      );

      case "ov-leads": return(
        <div>
          {s.leadSources.length===0&&<p className="text-xs text-center py-6 text-slate-400">No prospects active</p>}
          <div className="space-y-3">
            {s.leadSources.slice(0,5).map((l,i)=>(
              <div key={i} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded-lg" onClick={() => setFacet({ type: "source", value: l.source })}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 shadow-xs" style={{background:PAL[i%PAL.length]}}>
                  {l.source.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-slate-700">{l.source}</p>
                  <p className="text-[11px] text-slate-400 font-medium">{l.leads} prospects · {l.converted} converted</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-slate-800">{fmtK(l.value)}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">value</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[#DDDBDA] flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">{fmt(s.totalLeads)} total prospects</span>
            <span className="font-bold text-[#0176D3] hover:underline cursor-pointer" onClick={() => setTab("accounts")}>Audit Sources →</span>
          </div>
        </div>
      );

      case "ov-opps": return(
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{borderCollapse:"collapse"}}>
            <thead>
              <tr className="bg-slate-50 border-b border-[#DDDBDA]">
                {["#","Opportunity Name","Stage","Deal Value","Days Open"].map((h,i)=>(
                  <th key={i} className="py-2.5 px-4 font-bold uppercase tracking-wider text-left text-slate-500" style={{fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.topOpportunities.length===0&&<tr><td colSpan={5} className="py-8 text-center text-slate-400">No open deals currently matching</td></tr>}
              {s.topOpportunities.map((o,i)=>(
                <tr key={i} className="border-b border-[#DDDBDA] transition-colors cursor-pointer hover:bg-blue-50/50">
                  <td className="py-3 px-4 font-bold text-slate-400">{i+1}</td>
                  <td className="py-3 px-4 font-bold text-[#0176D3] hover:underline">{o.name}</td>
                  <td className="py-3 px-4"><SPill s={o.stage}/></td>
                  <td className="py-3 px-4 font-black text-slate-800">{fmtK(o.value)}</td>
                  <td className="py-3 px-4 font-bold" style={{color:o.daysOpen>60?"#D32F2F":o.daysOpen>30?"#ED6C02":"#2E7D32"}}>{o.daysOpen}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      case "ov-insights": return(
        <div className="space-y-2.5">
          {insights.length===0&&<p className="text-xs text-center py-6 text-slate-400 dark:text-slate-400">Add data to calculate insights.</p>}
          {insights.map((ins,i)=>(
            <div key={i} className={cn("rounded-xl border p-3", IBG_CLASS[ins.type]??"bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700")}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{color:ICLR[ins.type]}} className="bg-white/80 dark:bg-slate-700 p-1 rounded-md shadow-2xs">{ins.icon}</span>
                <span className="text-xs font-bold text-slate-800 dark:text-white">{ins.title}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 mb-1">{ins.body}</p>
              <div className="text-[10px] text-slate-400 dark:text-slate-400 font-bold border-t border-dashed border-slate-300 dark:border-slate-700 mt-1.5 pt-1.5 flex items-center gap-1">
                <Sparkles size={10} className="text-[#0176D3]"/> Rec: <span className="text-[#0176D3] hover:underline cursor-pointer">{ins.recommendation}</span>
              </div>
            </div>
          ))}
        </div>
      );

      case "ov-activity": return(
        <div className="space-y-3">
          {s.activityBreakdown.slice(0,5).map((a,i)=>(
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs" style={{background:PAL[i%PAL.length]}}>
                <Activity size={12}/>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-700">{a.label}</p>
              </div>
              <span className="text-xs font-black text-slate-800">{fmt(a.count)} logs</span>
            </div>
          ))}
          {s.activityBreakdown.length===0&&<p className="text-xs text-center py-6 text-slate-400">No activity logged</p>}
        </div>
      );

      // ── Pipeline ─────────────────────────────────────────────────────────────
      case "pi-stages": return(
        <div className="space-y-3">
          {s.stageConversion.map((x,i,arr)=>{
            const maxC=Math.max(...arr.map(a=>a.count),1);
            const pct=(x.count/maxC)*100;
            const c=PAL[i%PAL.length];
            return(
              <div key={i} className="flex items-center gap-3 cursor-pointer" onClick={() => setFacet({ type: "stage", value: x.stage })}>
                <span className="text-right text-xs font-bold w-24 shrink-0 text-slate-500">{x.stage}</span>
                <div className="flex-1 h-8 rounded-lg relative overflow-hidden bg-slate-100">
                  <div className="h-full rounded-lg transition-all duration-500 bg-blue-50" style={{width:`${Math.max(pct,2)}%`,background:`${c}15`,borderRight:`3px solid ${c}`}}/>
                  <span className="absolute inset-0 flex items-center px-3 text-xs font-extrabold" style={{color:c}}>{x.count} deals</span>
                </div>
                <span className="w-20 text-right text-xs font-bold shrink-0" style={{color:i===0?SOFT:x.rate>=70?"#2E7D32":x.rate>=40?"#ED6C02":"#D32F2F"}}>
                  {i===0?"entry":`${x.rate}% conv`}
                </span>
              </div>
            );
          })}
        </div>
      );

      case "pi-aging": return(
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={s.opportunityAging} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
              <XAxis dataKey="bucket" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="count" name="Deals" radius={[4,4,0,0]}>
                {s.opportunityAging.map((_,i)=><Cell key={i} fill={agingC[i]??MUTED}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-1 mt-3">
            {s.opportunityAging.map((a,i)=>(
              <div key={i} className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                <div style={{fontSize:10,color:MUTED,fontWeight:700}}>{a.bucket}</div>
                <div className="text-xs font-black" style={{color:agingC[i]??MUTED}}>{fmtK(a.value)}</div>
              </div>
            ))}
          </div>
        </>
      );

      case "pi-value": return(
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={openOpps} margin={{top:4,right:4,bottom:0,left:-10}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="stage" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
            <Tooltip content={<Tip/>} formatter={v=>fmtK(Number(v))}/>
            <Bar dataKey="value" name="Value" radius={[4,4,0,0]}>
              {openOpps.map((x,i)=>(
                <Cell 
                  key={i} 
                  fill={PAL[i%PAL.length]} 
                  className="cursor-pointer"
                  onClick={() => setFacet({ type: "stage", value: x.stage })}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

      case "pi-opps": return <>{renderContent("ov-opps",s,onViewReport)}</>;

      // ── Revenue ──────────────────────────────────────────────────────────────
      case "rv-forecast": return(
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={s.forecastMonths} margin={{top:4,right:4,bottom:0,left:-10}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="month" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
            <Tooltip content={<Tip/>} formatter={v=>fmtK(Number(v))}/>
            <Bar dataKey="actual"   name="Actual Won"   fill={`${PAL[1]}20`} stroke={PAL[1]} strokeWidth={1} radius={[4,4,0,0]}/>
            <Bar dataKey="forecast" name="AI Forecast" fill={`${PAL[0]}15`} stroke={PAL[0]} strokeWidth={1} radius={[4,4,0,0]}/>
            <Line type="monotone" dataKey="quota" name="Target Quota" stroke={MUTED} strokeWidth={2} strokeDasharray="5 3" dot={false}/>
          </ComposedChart>
        </ResponsiveContainer>
      );

      case "rv-winloss": return(
        <div className="flex items-start gap-5">
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie data={[
                {name:"Won", value:s.pipelineByStage.find(x=>x.stage==="Won")?.count||0},
                {name:"Lost",value:s.pipelineByStage.find(x=>x.stage==="Lost")?.count||0},
              ]} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={5} dataKey="value" startAngle={90} endAngle={-270}>
                <Cell fill={PAL[6]} className="cursor-pointer" onClick={() => setFacet({ type: "stage", value: "Won" })}/>
                <Cell fill={PAL[7]} className="cursor-pointer" onClick={() => setFacet({ type: "stage", value: "Lost" })}/>
              </Pie>
              <Tooltip content={<Tip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5 text-slate-400">By Reasons</p>
            {s.winLossReasons.map((r,i)=>(
              <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
                <span className="flex-1 truncate font-semibold text-slate-600">{r.reason}</span>
                <span className="font-extrabold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-sm border border-green-100">{r.won}W</span>
                <span className="font-extrabold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-sm border border-red-100">{r.lost}L</span>
              </div>
            ))}
          </div>
        </div>
      );

      case "rv-sources": return(
        <div className="space-y-3">
          {s.leadSources.map((x,i)=>{
            const maxV=Math.max(...s.leadSources.map(a=>a.value),1);
            const pct=(x.value/maxV)*100;
            return(
              <div key={i} className="cursor-pointer" onClick={() => setFacet({ type: "source", value: x.source })}>
                <div className="flex justify-between mb-1 text-xs">
                  <span className="font-bold text-slate-700">{x.source}</span>
                  <span className="font-black text-slate-800">{fmtK(x.value)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.max(pct,2)}%`,background:PAL[i%PAL.length]}}/>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-bold uppercase">
                  <span>{x.leads} leads</span><span>{x.converted} converted</span>
                </div>
              </div>
            );
          })}
        </div>
      );

      case "rv-treemap": return treemap.length>0?(
        <ResponsiveContainer width="100%" height={260}>
          <Treemap data={treemap} dataKey="size" aspectRatio={4/3} content={<TreeContent/>}>
            <Tooltip formatter={v=>fmtK(Number(v))}/>
          </Treemap>
        </ResponsiveContainer>
      ):<div className="h-40 flex items-center justify-center text-xs text-slate-400">No pipeline data logged</div>;

      // ── Campaigns ─────────────────────────────────────────────────────────────
      case "ca-bars": return(
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={s.campaignPerf} margin={{top:4,right:4,bottom:0,left:-20}} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="name" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false} unit="%"/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="openRate"  name="Open Rate"  fill={PAL[0]} radius={[4,4,0,0]}/>
            <Bar dataKey="replyRate" name="Reply Rate" fill={PAL[3]} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      );

      case "ca-radar": return(
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radar} cx="50%" cy="50%">
            <PolarGrid stroke={GRID_C}/>
            <PolarAngleAxis dataKey="m" tick={{fontSize:11,fill:TICK_C,fontWeight:600}}/>
            <PolarRadiusAxis angle={90} domain={[0,100]} tick={{fontSize:11,fill:TICK_C}}/>
            <Radar name="Performance" dataKey="v" stroke={PAL[0]} fill={PAL[0]} fillOpacity={0.12} strokeWidth={2}/>
            <Tooltip content={<Tip/>}/>
          </RadarChart>
        </ResponsiveContainer>
      );

      case "ca-scatter": return(
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{top:10,right:20,bottom:20,left:-10}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="x" name="Open Rate" type="number" unit="%" tick={{fontSize:11,fill:TICK_C}} axisLine={false} tickLine={false} label={{value:"Open Rate %",position:"insideBottom",offset:-8,fill:TICK_C,fontSize:11}}/>
            <YAxis dataKey="y" name="Reply Rate" type="number" unit="%" tick={{fontSize:11,fill:TICK_C}} axisLine={false} tickLine={false} label={{value:"Reply %",angle:-90,position:"insideLeft",fill:TICK_C,fontSize:11}}/>
            <ZAxis dataKey="z" range={[40,400]}/>
            <Tooltip content={<Tip/>}/>
            <Scatter data={scatter} fill={PAL[0]} fillOpacity={0.5} stroke={PAL[0]} strokeWidth={1.5}/>
          </ScatterChart>
        </ResponsiveContainer>
      );

      case "ca-stacked": return(
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={s.engagement} margin={{top:4,right:4,bottom:0,left:-20}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="day" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="opens"   name="Opens"   stackId="a" fill={PAL[0]}/>
            <Bar dataKey="clicks"  name="Clicks"  stackId="a" fill={PAL[1]}/>
            <Bar dataKey="replies" name="Replies" stackId="a" fill={PAL[3]} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      );

      case "ca-leader": return(
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{borderCollapse:"collapse"}}>
            <thead>
              <tr className="bg-slate-50 border-b border-[#DDDBDA]">
                {["Rank","Campaign Subject","Open Rate","Reply Rate","Emails Volume"].map((h,i)=>(
                  <th key={i} className="py-2.5 px-4 font-bold uppercase tracking-wider text-left text-slate-500" style={{fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topCamps.map((c,i)=>(
                <tr key={i} className="border-b border-[#DDDBDA] transition-colors cursor-pointer hover:bg-blue-50/50">
                  <td className="py-3 px-4 font-bold" style={{color:i===0?"#F59E0B":MUTED}}>{i+1}</td>
                  <td className="py-3 px-4 font-bold text-[#0176D3] hover:underline">{c.name}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.min(c.openRate,100)}%`,background:PAL[0]}}/>
                      </div>
                      <span className="font-extrabold text-slate-800">{c.openRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold" style={{color:PAL[3]}}>{c.replyRate}%</td>
                  <td className="py-3 px-4 text-slate-500 font-semibold">{fmt(c.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      // ── Activity ──────────────────────────────────────────────────────────────
      case "ac-heatmap": return <Heatmap data={s.heatmap}/>;

      case "ac-pie": return(
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={actPie} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="count" startAngle={90} endAngle={-270}>
                  {actPie.map((d,i)=>(
                    <Cell 
                      key={i} 
                      fill={d.fill} 
                      className="cursor-pointer transition-opacity hover:opacity-85"
                      onClick={() => setFacet({ type: "source", value: d.label })}
                    />
                  ))}
                </Pie>
                <Tooltip content={<Tip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-slate-800">{fmt(s.activityBreakdown.reduce((a,x)=>a+x.count,0))}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">total</span>
            </div>
          </div>
          <div className="w-full space-y-1.5">
            {actPie.slice(0,5).map((d,i)=>(
              <div key={i} className="flex items-center gap-2 text-xs cursor-pointer" onClick={() => setFacet({ type: "source", value: d.label })}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:d.fill,display:"inline-block"}}/>
                <span className="flex-1 truncate font-semibold text-slate-600">{d.label}</span>
                <span className="font-black text-slate-800">{fmt(d.count)}</span>
              </div>
            ))}
          </div>
        </div>
      );

      case "ac-trend": return(
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={s.engagement.slice(-7)} margin={{top:4,right:4,bottom:0,left:-20}}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PAL[0]} stopOpacity={0.25}/><stop offset="100%" stopColor={PAL[0]} stopOpacity={0}/></linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PAL[1]} stopOpacity={0.25}/><stop offset="100%" stopColor={PAL[1]} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="day" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Area type="monotone" dataKey="opens"   name="Opens"  stroke={PAL[0]} strokeWidth={2} fill="url(#g1)" dot={false}/>
            <Area type="monotone" dataKey="replies" name="Replies" stroke={PAL[1]} strokeWidth={2} fill="url(#g2)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      );

      case "ac-bars": return(
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={s.activityBreakdown} margin={{top:4,right:4,bottom:0,left:-10}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="label" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="count" name="Logs" radius={[4,4,0,0]}>
              {s.activityBreakdown.map((_,i)=><Cell key={i} fill={PAL[i%PAL.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

      // ── Accounts ──────────────────────────────────────────────────────────────
      case "aa-health": return(
        <div className="flex items-center gap-5">
          <div className="relative">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={s.accountHealthDist} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={4} dataKey="count" startAngle={90} endAngle={-270}>
                  {s.accountHealthDist.map((d,i)=>(
                    <Cell 
                      key={i} 
                      fill={hlthC[i]} 
                      className="cursor-pointer"
                      onClick={() => setFacet({ type: "source", value: d.bucket })}
                    />
                  ))}
                </Pie>
                <Tooltip content={<Tip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-slate-800">{fmt(s.totalLeads)}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">accounts</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {s.accountHealthDist.map((d,i)=>(
              <div key={i} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1" onClick={() => setFacet({ type: "source", value: d.bucket })}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:hlthC[i],display:"inline-block"}}/>
                <span className="flex-1 font-semibold text-slate-600">{d.bucket}</span>
                <span className="font-extrabold text-slate-800">{d.count}</span>
                <span className="text-slate-400 text-[10px] font-bold">{s.totalLeads>0?`${Math.round((d.count/s.totalLeads)*100)}%`:"0%"}</span>
              </div>
            ))}
          </div>
        </div>
      );

      case "aa-sources": return <>{renderContent("rv-sources",s,onViewReport)}</>;

      case "aa-score": return(
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={s.leadScoreDist} margin={{top:4,right:4,bottom:0,left:-20}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="bucket" tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:TICK_C,fontWeight:600}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="count" name="Prospects" radius={[4,4,0,0]}>
              {s.leadScoreDist.map((_,i)=><Cell key={i} fill={[MUTED,PAL[5],PAL[0],PAL[1],PAL[2]][i]??PAL[0]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

      case "aa-mix": return(
        <div className="flex items-center gap-8">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={mixData} cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                  {mixData.map((d,i)=><Cell key={i} fill={d.fill} className="cursor-pointer" onClick={() => setFacet({ type: "source", value: d.name })}/>)}
                </Pie>
                <Tooltip content={<Tip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-slate-800">{fmt(totalMix)}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">total</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {mixData.map((d,i)=>(
              <div key={i} className="flex items-center gap-2.5 text-xs cursor-pointer" onClick={() => setFacet({ type: "source", value: d.name })}>
                <span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill,display:"inline-block"}}/>
                <span className="w-14 font-semibold text-slate-500">{d.name}</span>
                <span className="font-black text-slate-800">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      );

      default: return <p className="text-xs text-center py-6 text-slate-400">Panel not found</p>;
    }
  }

  const TABS:{id:TabId;label:string}[]=[
    {id:"overview",  label:"Overview Insights"},
    {id:"pipeline",  label:"Deals Pipeline"},
    {id:"revenue",   label:"Revenue Forecast"},
    {id:"campaigns", label:"Campaign Engagement"},
    {id:"activity",  label:"Rep Actions Log"},
    {id:"accounts",  label:"Account Audit"},
  ];

  function getKPIs(tab:TabId, s:AnalyticsStats){
    const convRate=s.totalLeads>0?((s.convertedLeads/s.totalLeads)*100).toFixed(1):"0.0";
    switch(tab){
      case "overview": return[
        {label:"Emails Sent Volume", value:fmt(s.emailsSent),      sub:"all campaigns",    icon:<Mail size={18}/>,       colorIdx:0},
        {label:"Sales Open Ratio",  value:`${s.openRate}%`,        sub:"avg open rate",    icon:<MailOpen size={18}/>,   colorIdx:1, trend:s.openRate>20?4:-2},
        {label:"Active Hot Prospects",  value:fmt(s.hotLeads),         sub:`of ${fmt(s.totalLeads)} prospects`,icon:<Flame size={18}/>,colorIdx:2},
        {label:"Closed Won Revenue",value:fmtK(s.wonRevenue),      sub:"won this period",  icon:<Trophy size={18}/>,     colorIdx:3},
      ];
      case "pipeline": return[
        {label:"Open Pipeline Value",value:fmtK(s.pipelineTotal),  sub:"unclosed opportunities",icon:<TrendingUp size={18}/>,colorIdx:0},
        {label:"Active Deals Count", value:fmt(s.pipelineByStage.filter(x=>!["Won","Lost"].includes(x.stage)).reduce((a,x)=>a+x.count,0)),sub:"active deals in progress",icon:<BarChart2 size={18}/>,colorIdx:1},
        {label:"Average Deal Velocity", value:`${s.dealVelocity} days`,sub:"from qualification to close",icon:<Clock size={18}/>,colorIdx:s.dealVelocity>60?3:2},
        {label:"Rep Close Win Rate",value:`${s.winRate.toFixed(1)}%`,sub:"won out of closed deals",icon:<Target size={18}/>,colorIdx:4},
      ];
      case "revenue": return[
        {label:"Won Opportunity Value",value:fmtK(s.wonRevenue),   sub:"this fiscal period",icon:<DollarSign size={18}/>,colorIdx:4},
        {label:"Average Opportunities Size",value:fmtK(s.avgDealValue),sub:"mean value per deal",icon:<Trophy size={18}/>,    colorIdx:0},
        {label:"Total Quota Target", value:fmtK(s.quotaTarget),     sub:"target this period",icon:<Target size={18}/>,    colorIdx:1},
        {label:"Active Pipeline Coverage",value:`${s.pipelineCoverage}×`,sub:"pipeline ratio to target",icon:<TrendingUp size={18}/>,colorIdx:2},
      ];
      case "campaigns": return[
        {label:"Campaign Programs",   value:fmt(s.campaignPerf.length),sub:"total campaign flows",icon:<Mail size={18}/>,    colorIdx:0},
        {label:"Avg Open Engagement", value:`${s.openRate}%`,          sub:"across email campaigns",icon:<MailOpen size={18}/>,colorIdx:1},
        {label:"Avg Reply Interactivity",value:`${s.replyRate}%`,      sub:"across response channels",icon:<Reply size={18}/>,colorIdx:2},
        {label:"Total Emails Sent",   value:fmt(s.emailsSent),         sub:"outbound sends count",icon:<Zap size={18}/>,      colorIdx:3},
      ];
      case "activity": return[
        {label:"Total Logged Activities",value:fmt(s.activityBreakdown.reduce((a,x)=>a+x.count,0)),sub:"all tasks and calls",icon:<Activity size={18}/>,colorIdx:0},
        {label:"Total CRM Prospect Base",  value:fmt(s.totalLeads),         sub:"prospects in database",icon:<Users size={18}/>,       colorIdx:1},
        {label:"High-Intent Hot Prospects",value:fmt(s.hotLeads),           sub:"prospect score > 75",  icon:<Flame size={18}/>,       colorIdx:2},
        {label:"Engagement Clicks",    value:`${s.clickRate}%`,         sub:"link interaction rate",icon:<Globe size={18}/>,   colorIdx:3},
      ];
      case "accounts": return[
        {label:"Total Client Accounts",value:fmt(s.totalLeads),         sub:"monitored accounts",icon:<Users size={18}/>,      colorIdx:0},
        {label:"At Risk Accounts",     value:fmt(s.hotLeads),           sub:"flagged relationship score",icon:<Flame size={18}/>,colorIdx:1},
        {label:"Prospect Conversion Count",value:fmt(s.convertedLeads),     sub:"prospects converted to accounts",icon:<CheckCircle2 size={18}/>,colorIdx:4},
        {label:"Prospect-To-Account Ratio",value:`${convRate}%`,            sub:"overall success percentage",icon:<Target size={18}/>,colorIdx:2},
      ];
    }
  }

  const kpis=getKPIs(tab,s);
  const visiblePanels=getPanels(tab);
  const hiddenInTab=(DEFAULT_PANELS[tab]??[]).filter(id=>cfg.hidden.includes(id));

  return(
    <div style={{margin:"-20px -24px",minHeight:"100vh"}} className={cn(presentMode?"p-8":"", "font-sans text-slate-800 bg-slate-50 dark:bg-slate-950")}>

      {/* ── Header Toolbar ─────────────────────────────────────────────────── */}
      <div className="shadow-xs bg-white dark:bg-slate-50 border-b border-slate-200 dark:border-slate-100">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3.5 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            {/* Nxelio Brand / Analytics Logo */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-linear-to-tr from-[#0176D3] to-[#52B7D8] shadow-md relative overflow-hidden animate-pulse">
              <Sparkles size={16} className="absolute top-1 right-1 text-sky-100 opacity-80" />
              <Layers size={20} className="relative z-10" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-sm tracking-tight text-slate-900 dark:text-white uppercase">Nxelio Nurture Intelligence Hub</h1>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-sm bg-indigo-600 text-white shadow-2xs">AI POWERED</span>
              </div>
              <p style={{fontSize:11}} className="font-bold flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                Dashboards <ChevronDown size={10}/> <span className="text-[#0176D3] hover:underline cursor-pointer">Sales Performance Overview</span>
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2 flex-wrap">
            {loading&&<span className="text-xs flex items-center gap-1.5 font-bold text-[#0176D3] animate-pulse"><span className="w-3 h-3 rounded-full border-2 border-[#0176D3] border-t-transparent animate-spin inline-block"/>Updating Workspace…</span>}

            {/* Saved Views Dropdown */}
            <div className="relative">
              <button 
                onClick={()=>setViewsOpen(!viewsOpen)} 
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <Layers size={12} className="text-[#0176D3]"/>
                <span>View: {activeViewName}</span>
                <ChevronDown size={10} className="text-slate-400"/>
              </button>
              {viewsOpen && (
                <div className="absolute top-[38px] left-0 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="px-3 py-1 text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-200 pb-1.5 mb-1.5">Saved Analytics Views</p>
                  {savedViews.map((view, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setFilters(view.filters);
                        setActiveViewName(view.name);
                        setViewsOpen(false);
                      }}
                      className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-200 font-semibold flex items-center justify-between cursor-pointer", activeViewName === view.name ? "text-[#0176D3] bg-blue-50/50 dark:bg-blue-950/20" : "text-slate-600 dark:text-slate-350")}
                    >
                      <span>{view.name}</span>
                      {activeViewName === view.name && <CheckCircle2 size={12} className="text-[#0176D3]"/>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* IQL Editor Toggle */}
            <button 
              onClick={()=>setIqlMode(!iqlMode)} 
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all shadow-2xs cursor-pointer", iqlMode?"bg-indigo-600 text-white border-indigo-700":"bg-white dark:bg-slate-100 text-slate-700 dark:text-slate-700 border-slate-200 dark:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-200")}
            >
              <Code2 size={12}/>{iqlMode?"Hide Editor":"Insight Query Studio"}
            </button>

            {/* Present Mode */}
            <button 
              onClick={()=>setPresentMode(!presentMode)} 
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all shadow-2xs cursor-pointer", presentMode?"bg-slate-800 dark:bg-slate-50 text-white border-slate-900 dark:border-slate-950":"bg-white dark:bg-slate-100 text-slate-700 dark:text-slate-700 border-slate-200 dark:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-200")}
            >
              <Eye size={12}/>{presentMode?"Dashboard View":"Present"}
            </button>

            {/* Customize */}
            <button onClick={()=>setCustomizing(p=>!p)} className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all shadow-2xs cursor-pointer", customizing?"bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800":"bg-white dark:bg-slate-100 text-slate-700 dark:text-slate-700 border-slate-200 dark:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-200")}>
              <Settings2 size={12}/>{customizing?"Editing Grid":"Edit Dashboard Layout"}
            </button>

            {/* Export */}
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all bg-white dark:bg-slate-100 hover:bg-slate-50 dark:hover:bg-slate-200 text-slate-700 dark:text-slate-700 border-slate-200 dark:border-slate-200 cursor-pointer">
              <Download size={12}/>CSV Export
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        {!presentMode && (
          <div className="px-6 py-2 border-t border-slate-200 dark:border-slate-100 bg-slate-50/70 dark:bg-slate-50/10 flex items-center gap-3 flex-wrap text-xs font-bold text-slate-700 dark:text-slate-700">
            <span className="flex items-center gap-1 text-slate-400 dark:text-slate-400 uppercase tracking-wider text-[10px] mr-1">
              <Layers size={11} className="text-[#0176D3]"/> Global Filters
            </span>

            {/* Range */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Clock size={11} className="text-slate-400"/>
              <select value={filters.range} onChange={e=>setFilters(prev=>({...prev,range:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-slate-700 dark:text-slate-700 pr-1">
                <option value="7">Last 7 Days</option>
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range…</option>
              </select>
            </div>

            {/* Region */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Globe size={11} className="text-slate-400"/>
              <span className="text-slate-400 font-medium">Region:</span>
              <select value={filters.region} onChange={e=>setFilters(prev=>({...prev,region:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-slate-700 dark:text-slate-700 pr-1">
                {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Owner */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Users size={11} className="text-slate-400"/>
              <span className="text-slate-400 font-medium">Owner:</span>
              <select value={filters.owner} onChange={e=>setFilters(prev=>({...prev,owner:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-[#0176D3] pr-1">
                {OWNERS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* Industry */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Layers size={11} className="text-slate-400"/>
              <span className="text-slate-400 font-medium">Industry:</span>
              <select value={filters.industry} onChange={e=>setFilters(prev=>({...prev,industry:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-slate-700 dark:text-slate-700 pr-1">
                {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            {/* Lead Source */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Globe size={11} className="text-slate-400"/>
              <span className="text-slate-400 font-medium">Source:</span>
              <select value={filters.leadSource} onChange={e=>setFilters(prev=>({...prev,leadSource:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-slate-700 dark:text-slate-700 pr-1">
                {LEAD_SOURCES.map(l=><option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Stage */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-100 border border-slate-200 dark:border-slate-200 rounded-md px-2.5 py-1.5 shadow-2xs">
              <Target size={11} className="text-slate-400"/>
              <span className="text-slate-400 font-medium">Stage:</span>
              <select value={filters.stage} onChange={e=>setFilters(prev=>({...prev,stage:e.target.value}))} className="bg-transparent outline-none cursor-pointer text-slate-700 dark:text-slate-700 pr-1">
                {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Clear All Filters */}
            {(filters.region!=="All" || filters.owner!=="All" || filters.industry!=="All" || filters.leadSource!=="All" || filters.stage!=="All" || facet !== null) && (
              <button 
                onClick={()=>{setFilters(DEFAULT_FILTERS); setFacet(null); setActiveViewName("Default Analytics View");}} 
                className="text-xs text-red-600 hover:text-red-800 transition-colors flex items-center gap-1 ml-auto cursor-pointer border-0 bg-transparent font-bold"
              >
                <RotateCcw size={11}/> Reset Filters
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center px-4 pt-1.5 pb-0 gap-1 border-t border-slate-200 dark:border-slate-100 bg-slate-50/30">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={cn("px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all relative border-b-2 uppercase tracking-wide cursor-pointer", tab===t.id?"border-[#0176D3] text-[#0176D3] bg-white dark:bg-slate-100 shadow-2xs":"border-transparent text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-100/50")}>
              {t.label}
              {tab===t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0176D3]"/>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Customize toolbar ────────────────────────────────────────────────── */}
      {customizing&&(
        <div className="flex items-center justify-between px-6 py-2.5 border-b" style={{background:BRAND_BLUE_BG,borderColor:"#93C5FD"}}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black uppercase text-[#0176D3] tracking-wider">Customize Dashboard Layout</span>
            <span style={{fontSize:11,color:MUTED}} className="font-bold">Drag cards to reorder grid · click <EyeOff size={11} className="inline mb-0.5"/> to hide specific cards</span>
            {hiddenInTab.map(id=>(
              <button key={id} onClick={()=>showPanel(id)} className="flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full border border-blue-200 transition-all text-[#0176D3] bg-white hover:bg-slate-50 shadow-2xs cursor-pointer">
                <Eye size={10}/>{PM[id]?.title??id}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetLayout} className="text-xs px-3 py-1.5 rounded-lg border bg-white font-bold hover:bg-slate-50 text-slate-500 shadow-2xs cursor-pointer" style={{borderColor:BORDER}}>Reset Dashboard</button>
            <button onClick={()=>setCustomizing(false)} className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg text-white font-black bg-[#0176D3] hover:bg-[#005FB2] shadow-md border-0 cursor-pointer">
              <X size={11}/>Finish Editing
            </button>
          </div>
        </div>
      )}

      {/* ── IQL Query Studio Drawer ───────────────────────────────────────────── */}
      {iqlMode && (
        <div className="bg-slate-900 text-slate-100 border-b border-slate-700 shadow-2xl p-5 animate-in slide-in-from-top duration-250">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-indigo-400 animate-pulse" />
              <span className="text-xs font-black tracking-wider uppercase text-indigo-400">Insight Query Studio (IQL Runner)</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={runIQL} 
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0176D3] hover:bg-[#005FB2] text-white text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer border-0"
              >
                <Play size={10}/>Run Query
              </button>
              <button 
                onClick={() => setIqlQuery(IQL_QUERIES[tab] || IQL_QUERIES.overview)} 
                className="text-xs px-3 py-1.5 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-400 font-semibold cursor-pointer"
              >
                Reset Default
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 relative">
              <div className="absolute top-2.5 left-3 text-[10px] font-bold text-slate-600 select-none">IQL EDITOR</div>
              <textarea 
                value={iqlQuery} 
                onChange={e=>setIqlQuery(e.target.value)} 
                className="w-full h-36 font-mono text-xs bg-slate-950 text-indigo-300 border border-slate-700 rounded-lg p-5 pt-8 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none leading-relaxed"
                spellCheck="false"
              />
              {iqlError && (
                <div className="absolute bottom-2.5 left-3 right-3 bg-red-950/60 border border-red-800 text-red-300 px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5">
                  <AlertCircle size={12}/>{iqlError}
                </div>
              )}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs space-y-2.5 leading-relaxed">
              <h4 className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">IQL Projection Reference</h4>
              <p className="text-slate-400 font-medium">This console compiles standard Nxelio Nurture IQL query directives. Try modifying lines like:</p>
              <code className="block bg-slate-900 border border-slate-800 p-2 rounded text-indigo-300 font-mono text-[10px]">
                q = filter q by &apos;Region&apos; == &quot;West&quot;;<br/>
                q = filter q by &apos;Stage&apos; == &quot;Proposal Sent&quot;;
              </code>
              <p className="text-[10px] text-slate-500 italic">Clicking &quot;Run Query&quot; dynamically updates the dashboard visualization parameters.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Content Grid ───────────────────────────────────────────────────── */}
      <div className="px-6 py-6 flex flex-col gap-6">

        {/* Facet Filter Banner */}
        {facet && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-center justify-between text-xs font-bold text-indigo-950 shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-600 animate-bounce" />
              <span>Interactive Facet Filter Active: Only showing records matching <span className="bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-300 text-indigo-800">{facet.type} = &quot;{facet.value}&quot;</span></span>
            </div>
            <button 
              onClick={()=>setFacet(null)} 
              className="px-3 py-1 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-black rounded-lg transition-all shadow-xs cursor-pointer border-0"
            >
              Clear Facet Filter
            </button>
          </div>
        )}

        {/* Attainment Speedometers Section */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NxelioGauge value={s.quotaAttainment} label="Quota Attainment Rate" sub="target won comparison" type="percentage" />
            <NxelioGauge value={s.winRate} label="Opportunities Win Rate" sub="won closed deal ratio" type="percentage" />
            <NxelioGauge value={s.pipelineCoverage} label="Pipeline Target Coverage" sub="coverage multiplier" type="coverage" />
          </div>
        )}

        {/* Top summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpis.map((k,i)=>(
            <div key={i} className="rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden border bg-white shadow-2xs hover:shadow-xs transition-shadow border-[#DDDBDA]" style={{minHeight: 135}}>
              <div className="absolute top-4 right-4 text-slate-300 bg-slate-50 p-1.5 rounded-lg border border-slate-100">{k.icon}</div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{k.label}</p>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{k.value}</p>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs">
                {k.trend!==undefined&&(
                  <span className="flex items-center gap-0.5 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                    {k.trend >= 0 ? <ArrowUpRight size={10}/> : <ArrowDown size={10}/>}{Math.abs(k.trend)}%
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-bold uppercase">{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Custom Visualizations Grid */}
        <div className="grid grid-cols-2 gap-4">
          {visiblePanels.map(id=>{
            const meta=PM[id];
            if(!meta)return null;
            const isHalf=meta.span==="half";
            const isDragging=dragging===id;
            const isDragOver=dragOver===id;
            const noPad=["ov-opps","pi-opps","ca-leader"].includes(id);
            const facetActive = !!(facet && ((facet.type === "stage" && id.includes("stages")) || (facet.type === "source" && id.includes("donut"))));
            
            return(
              <div key={id} className={isHalf?"col-span-2 md:col-span-1":"col-span-2"}
                draggable={customizing}
                onDragStart={()=>setDragging(id)}
                onDragOver={e=>{e.preventDefault();if(dragging!==id)setDragOver(id);}}
                onDrop={()=>handleDrop(tab,id)}
                onDragEnd={()=>{setDragging(null);setDragOver(null);}}>
                <WCard
                  title={meta.title}
                  icon={meta.icon}
                  noPad={noPad}
                  customizing={customizing}
                  dragging={isDragging}
                  dragOver={isDragOver}
                  onHide={()=>hidePanel(id)}
                  facetActive={facetActive}
                  onFacetClear={() => setFacet(null)}
                >
                  {renderContent(id,s,()=>setShowReport(true))}
                </WCard>
              </div>
            );
          })}

          {visiblePanels.length===0&&(
            <div className="col-span-2 flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-[#DDDBDA] text-slate-400">
              <EyeOff size={32} className="mb-3 opacity-30 text-slate-500"/>
              <p className="font-bold mb-1 text-slate-700">All panels are currently hidden</p>
              <p className="text-xs mb-4">Click the disabled badges in the customize toolbar to show them</p>
              <button onClick={resetLayout} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0176D3] hover:bg-[#005FB2] border-0 cursor-pointer">
                <RotateCcw size={13}/>Reset Layout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Nxelio Copilot Chatbot (Floating Drawer Button) ───────────────── */}
      <div className="fixed bottom-6 right-6 z-50">
        {!chatOpen ? (
          <button 
            onClick={()=>setChatOpen(true)} 
            className="w-14 h-14 rounded-full flex items-center justify-center text-white bg-linear-to-tr from-indigo-600 via-[#0176D3] to-sky-400 shadow-2xl hover:scale-105 transition-all cursor-pointer relative group border-0"
          >
            <Bot size={24} className="group-hover:rotate-6 transition-transform" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-ping"/>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full"/>
          </button>
        ) : (
          <div className="w-[360px] h-[500px] bg-white border border-[#DDDBDA] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
            {/* Header */}
            <div className="bg-linear-to-tr from-slate-900 to-indigo-950 p-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md animate-pulse">
                  <Bot size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-wide uppercase">Nxelio Nurture Assistant</h4>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                    <span className="text-[10px] text-slate-400 font-bold">AI Assistant Active</span>
                  </div>
                </div>
              </div>
              <button onClick={()=>setChatOpen(false)} className="text-slate-400 hover:text-white transition-colors bg-transparent border-0 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {/* Message Pane */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.sender === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl p-3 text-xs shadow-xs leading-relaxed", msg.sender === "user" ? "bg-[#0176D3] text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none")}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Recommendation Pills */}
            <div className="px-4 py-2 bg-slate-100/50 border-t border-slate-100 flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none">
              {[
                "Won Revenue",
                "Win Rate",
                "Filter to West",
                "Reset Filters"
              ].map((pill, i) => (
                <button
                  key={i}
                  onClick={() => handleCopilotMessage(pill)}
                  className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold rounded-full text-[#0176D3] shadow-3xs shrink-0 cursor-pointer"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form 
              onSubmit={(e)=>{e.preventDefault(); handleCopilotMessage(chatInput);}} 
              className="p-3 border-t border-[#DDDBDA] bg-white flex items-center gap-2"
            >
              <input 
                type="text" 
                value={chatInput} 
                onChange={e=>setChatInput(e.target.value)} 
                placeholder="Ask AI Assistant..." 
                className="flex-1 border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400"
              />
              <button 
                type="submit" 
                className="p-2 bg-[#0176D3] hover:bg-[#005FB2] text-white rounded-lg shadow-md transition-transform active:scale-95 cursor-pointer border-0"
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── Custom date modal ─────────────────────────────────────────────────── */}
      <Modal open={customOpen} onClose={()=>{setCustomOpen(false); setFilters(prev=>({...prev,range:"30"}));}}>
        <div className="p-6 flex flex-col gap-5 bg-white rounded-2xl">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Custom Date Range</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {label:"From",val:customStart,set:setCustomStart,max:customEnd,min:undefined},
              {label:"To",  val:customEnd,  set:setCustomEnd,  max:today(),   min:customStart},
            ].map((f,i)=>(
              <div key={i}>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-slate-400">{f.label}</label>
                <input type="date" value={f.val} onChange={e=>f.set(e.target.value)} max={f.max} min={f.min}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white text-slate-800"/>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={()=>{setCustomOpen(false); setFilters(prev=>({...prev,range:"30"}));}} className="flex-1 border border-slate-200 rounded-xl py-2 text-xs font-bold text-slate-400 bg-white hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button onClick={applyCustom} disabled={!customStart||!customEnd} className="flex-1 rounded-xl py-2 text-xs font-bold text-white bg-[#0176D3] disabled:opacity-40 hover:bg-[#005FB2] border-0 cursor-pointer">Apply Range</button>
          </div>
        </div>
      </Modal>

      {/* ── Generate Report modal ─────────────────────────────────────────────── */}
      <Modal open={showReport} onClose={()=>setShowReport(false)}>
        <div className="p-6 flex flex-col gap-4 bg-white rounded-2xl">
          <div className="flex items-center gap-3 mb-1 border-b border-[#DDDBDA] pb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-linear-to-tr from-slate-900 to-indigo-950 shadow-md"><FileText size={18}/></div>
            <div>
              <h2 className="text-xs font-black uppercase text-slate-800">Analytics Audit Report</h2>
              <p style={{fontSize:11,color:MUTED}}>Projections for the selected filter parameters</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              {label:"Emails Sent Volume", value:fmt(s.emailsSent),            color:PAL[0]},
              {label:"Open Ratio",         value:`${s.openRate}%`,             color:PAL[1]},
              {label:"Response Ratio",     value:`${s.replyRate}%`,            color:PAL[2]},
              {label:"High-Score Prospects",   value:fmt(s.hotLeads),              color:"#ED6C02"},
              {label:"Open Pipeline Value",value:fmtK(s.pipelineTotal),        color:PAL[0]},
              {label:"Closed Won Revenue", value:fmtK(s.wonRevenue),           color:PAL[1]},
              {label:"Opportunities Win Rate",value:`${s.winRate.toFixed(1)}%`,color:PAL[4]},
              {label:"Quota Attained Rate",value:`${s.quotaAttainment}%`,      color:attColor},
            ].map((x,i)=>(
              <div key={i} className="rounded-xl p-3 border border-slate-100 bg-slate-50/50">
                <p style={{fontSize:10,color:MUTED,fontWeight:700,marginBottom:2}} className="uppercase tracking-wide">{x.label}</p>
                <p className="text-xl font-black text-slate-800" style={{color:x.color}}>{x.value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setShowReport(false)} className="flex-1 border border-[#DDDBDA] rounded-xl py-2.5 text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 cursor-pointer">Close Report</button>
            <button onClick={()=>{exportCSV();setShowReport(false);}} className="flex-1 rounded-xl py-2.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 shadow-md border-0 cursor-pointer">
              Export Audit CSV
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
