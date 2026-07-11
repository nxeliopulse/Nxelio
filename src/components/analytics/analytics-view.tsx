"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDown, ArrowUpRight, BarChart2, Bell,
  ChevronDown, Clock, Download, DollarSign, Eye, EyeOff,
  FileText, Flame, GitBranch, Globe, GripVertical,
  Lightbulb, Mail, MailOpen, MoreHorizontal, RefreshCw,
  Reply, RotateCcw, Search, Settings2, Target, TrendingUp,
  Trophy, Users, X, Zap, CheckCircle2,
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

// ── Tokens ─────────────────────────────────────────────────────────────────────
const BG       = "#F4F5F7";
const WHITE    = "#FFFFFF";
const BORDER   = "#E8E9EF";
const TEXT     = "#1A1A2B";
const MUTED    = "#6B7280";
const SOFT     = "#9CA3AF";
const PILL_BG  = "#1C1C2B";
const GRID_C   = "#F0F1F5";
const TICK_C   = "#9CA3AF";

// KPI card background colors (solid, white text)
const KPI_COLORS = [
  "#4F72DE", "#7C3AED", "#1C1C2B", "#F59E0B",
  "#059669", "#E11D48", "#0891B2", "#EA580C",
];
// Chart palette
const PAL = ["#4F72DE","#10B981","#F59E0B","#8B5CF6","#E11D48","#06B6D4","#EA580C","#EC4899"];
const DOW  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOUR = Array.from({length:24},(_,i)=>i===0?"12a":i<12?`${i}a`:i===12?"12p":`${i-12}p`);

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(n:number):string{if(n>=1e6)return`$${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`$${(n/1e3).toFixed(1)}K`;return`$${n}`;}
function fmt(n:number):string{if(n>=1e6)return`${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`${(n/1e3).toFixed(1)}K`;return String(n);}
function today(){return new Date().toISOString().slice(0,10);}
function csv(v:string|number){const s=String(v);return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}

// ── Panel system ───────────────────────────────────────────────────────────────
type TabId = "overview"|"pipeline"|"revenue"|"campaigns"|"activity"|"accounts";
type PanelId = string;
type PanelSpan = "full"|"half"|"third";

interface PMeta { title:string; span:PanelSpan; icon:React.ReactNode; }
const PM: Record<PanelId,PMeta> = {
  "ov-combo":    {title:"Overall Sales & Engagement", span:"full",  icon:<TrendingUp size={13}/>},
  "ov-donut":    {title:"Revenue Report",             span:"half",  icon:<BarChart2 size={13}/>},
  "ov-leads":    {title:"Recent Leads",               span:"half",  icon:<Users size={13}/>},
  "ov-opps":     {title:"Top Opportunities",          span:"full",  icon:<Trophy size={13}/>},
  "ov-insights": {title:"AI Insights",                span:"half",  icon:<Zap size={13}/>},
  "ov-activity": {title:"Activity Feed",              span:"half",  icon:<Activity size={13}/>},

  "pi-stages":   {title:"Pipeline Stage Funnel",      span:"full",  icon:<GitBranch size={13}/>},
  "pi-aging":    {title:"Opportunity Aging",          span:"half",  icon:<Clock size={13}/>},
  "pi-value":    {title:"Value by Stage",             span:"half",  icon:<DollarSign size={13}/>},
  "pi-opps":     {title:"Opportunities Table",        span:"full",  icon:<Trophy size={13}/>},

  "rv-forecast": {title:"Forecast vs Quota",          span:"full",  icon:<TrendingUp size={13}/>},
  "rv-winloss":  {title:"Win / Loss Analysis",        span:"half",  icon:<BarChart2 size={13}/>},
  "rv-sources":  {title:"Revenue by Source",          span:"half",  icon:<Globe size={13}/>},
  "rv-treemap":  {title:"Pipeline Distribution",      span:"full",  icon:<BarChart2 size={13}/>},

  "ca-bars":     {title:"Campaign Comparison",        span:"full",  icon:<Mail size={13}/>},
  "ca-radar":    {title:"Performance Radar",          span:"half",  icon:<Activity size={13}/>},
  "ca-scatter":  {title:"Efficiency Bubble",          span:"half",  icon:<Zap size={13}/>},
  "ca-stacked":  {title:"Daily Email Activity",       span:"full",  icon:<BarChart2 size={13}/>},
  "ca-leader":   {title:"Campaign Leaderboard",       span:"full",  icon:<Trophy size={13}/>},

  "ac-heatmap":  {title:"Activity Heatmap",           span:"full",  icon:<Clock size={13}/>},
  "ac-pie":      {title:"Activity Breakdown",         span:"half",  icon:<Activity size={13}/>},
  "ac-trend":    {title:"7-Day Trend",                span:"half",  icon:<TrendingUp size={13}/>},
  "ac-bars":     {title:"Volume by Type",             span:"full",  icon:<BarChart2 size={13}/>},

  "aa-health":   {title:"Account Health",             span:"half",  icon:<Activity size={13}/>},
  "aa-sources":  {title:"Lead Source Analysis",       span:"half",  icon:<Globe size={13}/>},
  "aa-score":    {title:"Lead Score Distribution",    span:"full",  icon:<Target size={13}/>},
  "aa-mix":      {title:"Interaction Mix",            span:"full",  icon:<MailOpen size={13}/>},
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
  return{order:{...DEFAULT_PANELS}as Record<TabId,PanelId[]>,hidden:[]};
}
function saveCfg(c:PanelCfg){try{localStorage.setItem("nx-v2-cfg",JSON.stringify(c));}catch{}}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tip({active,payload,label}:{active?:boolean;label?:string;payload?:Array<{name?:string;value?:number|string;color?:string}>}){
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#1C1C2B",border:"1px solid #2D2D3F",borderRadius:10,padding:"8px 12px",fontSize:13,minWidth:120}}>
      {label&&<p style={{color:"#CBD5E1",fontWeight:600,marginBottom:6}}>{label}</p>}
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:p.color??"#4F72DE",flexShrink:0}}/>
          <span style={{color:"#94A3B8"}}>{p.name}:</span>
          <span style={{fontWeight:700,color:"#F1F5F9",marginLeft:"auto",paddingLeft:8}}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
function Heatmap({data}:{data:number[][]}){
  const max=Math.max(...data.flat(),1);
  return(
    <div className="select-none">
      <div className="flex pl-8 mb-1">
        {HOUR.map((h,i)=><div key={i} className="flex-1 text-center" style={{fontSize:13,color:SOFT}}>{i%4===0?h:""}</div>)}
      </div>
      {data.map((row,d)=>(
        <div key={d} className="flex items-center mb-0.5">
          <span className="w-7 text-right pr-1" style={{fontSize:12,color:SOFT}}>{DOW[d]}</span>
          {row.map((v,h)=>{
            const t=v/max;
            return<div key={h} title={`${v} · ${DOW[d]} ${HOUR[h]}`} className="flex-1 h-5 transition-opacity hover:opacity-70"
              style={{background:v===0?"#EEF0F5":`rgba(79,114,222,${0.1+t*0.9})`,margin:"0 1px",borderRadius:2}}/>;
          })}
        </div>
      ))}
      <div className="flex items-center gap-1.5 justify-end mt-2">
        <span style={{fontSize:12,color:SOFT}}>Less</span>
        {[0,.2,.4,.6,.8,1].map((v,i)=><div key={i} className="w-4 h-3 rounded-sm" style={{background:v===0?"#EEF0F5":`rgba(79,114,222,${0.1+v*0.9})`}}/>)}
        <span style={{fontSize:12,color:SOFT}}>More</span>
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
    <rect x={x+2} y={y+2} width={width-4} height={height-4} rx={6} fill={`${c}18`} stroke={`${c}50`} strokeWidth={1}/>
    {width>55&&height>35&&<>
      <text x={x+width/2} y={y+height/2-7} textAnchor="middle" fill={TEXT} fontSize={13} fontWeight={600}>{name}</text>
      <text x={x+width/2} y={y+height/2+8} textAnchor="middle" fill={MUTED} fontSize={12}>{fmtK(value??0)}</text>
    </>}
  </g>);
}

// ── Stage pill ─────────────────────────────────────────────────────────────────
const PILL:Record<string,string>={
  "Won":"background:#ECFDF5;color:#059669","Lost":"background:#FFF1F2;color:#E11D48",
  "Qualified":"background:#EEF2FF;color:#4F72DE","New":"background:#F3F4F6;color:#6B7280",
  "Meeting Booked":"background:#F0FDFA;color:#0891B2","Proposal Sent":"background:#F5F3FF;color:#7C3AED",
  "Negotiation":"background:#FFFBEB;color:#F59E0B",
};
function SPill({s}:{s:string}){
  const st=PILL[s]??"background:#F3F4F6;color:#6B7280";
  return<span style={{...Object.fromEntries(st.split(";").map(p=>{const[k,v]=p.split(":");return[k.trim(),v?.trim()??""]})),fontSize:13,fontWeight:600,padding:"2px 8px",borderRadius:999}}>{s}</span>;
}

// ── KPI banner ─────────────────────────────────────────────────────────────────
interface KPI{label:string;value:string;sub:string;trend?:number;icon:React.ReactNode;colorIdx:number;}
function KPICard({label,value,sub,trend,icon,colorIdx}:KPI){
  const bg=KPI_COLORS[colorIdx%KPI_COLORS.length];
  const up=(trend??0)>=0;
  return(
    <div className="rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden" style={{background:bg,minHeight:140}}>
      <div className="absolute top-4 right-4 opacity-30">{icon}</div>
      <div>
        <p className="text-[14px] font-semibold mb-1" style={{color:"rgba(255,255,255,.65)"}}>{label}</p>
        <p className="text-4xl font-extrabold text-white">{value}</p>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {trend!==undefined&&(
          <span className="flex items-center gap-0.5 text-[14px] font-bold px-2 py-0.5 rounded-full" style={{background:"rgba(255,255,255,.15)",color:"white"}}>
            {up?<ArrowUpRight size={10}/>:<ArrowDown size={10}/>}{Math.abs(trend)}%
          </span>
        )}
        <span className="text-[14px]" style={{color:"rgba(255,255,255,.5)"}}>{sub}</span>
      </div>
    </div>
  );
}

// ── White card ─────────────────────────────────────────────────────────────────
interface CardP{
  title?:string;icon?:React.ReactNode;badge?:string;extra?:React.ReactNode;children:React.ReactNode;
  noPad?:boolean;customizing?:boolean;dragging?:boolean;dragOver?:boolean;
  onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:()=>void;
  onDragEnd?:()=>void;onHide?:()=>void;className?:string;
}
function WCard({title,icon,badge,extra,children,noPad,customizing,dragging,dragOver,onDragStart,onDragOver,onDrop,onDragEnd,onHide,className}:CardP){
  return(
    <div
      draggable={customizing}
      onDragStart={onDragStart}
      onDragOver={e=>{e.preventDefault();onDragOver?.(e);}}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn("rounded-2xl border overflow-hidden transition-all duration-150",dragOver?"ring-2 ring-[#4F72DE] ring-offset-1":"",dragging?"opacity-40":"",className)}
      style={{background:WHITE,borderColor:dragOver?"#4F72DE":BORDER,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}
    >
      {title&&(
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{borderColor:BORDER}}>
          <div className="flex items-center gap-2 min-w-0">
            {customizing&&<GripVertical size={14} style={{color:SOFT,flexShrink:0}}/>}
            {icon&&<span style={{color:"#4F72DE"}}>{icon}</span>}
            <h3 className="text-sm font-bold truncate" style={{color:TEXT}}>{title}</h3>
            {badge&&<span className="text-[14px] font-bold px-2 py-0.5 rounded-full" style={{background:"#EEF2FF",color:"#4F72DE"}}>{badge}</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {extra}
            {customizing&&onHide&&(
              <button onClick={onHide} className="p-1 rounded transition-colors" style={{color:SOFT}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color="#E11D48"} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color=SOFT}>
                <EyeOff size={13}/>
              </button>
            )}
            {!customizing&&<button className="p-1 rounded transition-colors" style={{color:SOFT}}><MoreHorizontal size={14}/></button>}
          </div>
        </div>
      )}
      <div className={noPad?"":customizing?"p-5 pointer-events-none":"p-5"}>{children}</div>
    </div>
  );
}

// ── Insights helper ────────────────────────────────────────────────────────────
const ICLR:Record<string,string>={positive:"#059669",info:"#4F72DE",attention:"#F59E0B",warning:"#E11D48"};
function computeInsights(s:AnalyticsStats){
  const r:Array<{type:string;icon:React.ReactNode;title:string;body:string}>=[];
  if(s.quotaAttainment>=80) r.push({type:"positive",icon:<Trophy size={11}/>,title:`${s.quotaAttainment}% quota attained`,body:"On track to exceed your revenue target this period."});
  else if(s.quotaAttainment<40) r.push({type:"warning",icon:<Target size={11}/>,title:`Only ${s.quotaAttainment}% attained`,body:"Accelerate deal progression to close the gap."});
  if(s.dealVelocity>60) r.push({type:"attention",icon:<Clock size={11}/>,title:`${s.dealVelocity}d avg deal velocity`,body:"Deals are aging — set next-step dates on stalled opportunities."});
  if(s.hotLeads>0) r.push({type:"positive",icon:<Flame size={11}/>,title:`${s.hotLeads} hot leads`,body:"Prioritise these in your next outreach sequence."});
  const top=[...s.campaignPerf].sort((a,b)=>b.openRate-a.openRate)[0];
  if(top) r.push({type:"info",icon:<Zap size={11}/>,title:`Best: ${top.name}`,body:`${top.openRate}% open rate — clone its subject line.`});
  if(s.replyRate<3&&s.emailsSent>50) r.push({type:"attention",icon:<Lightbulb size={11}/>,title:"Reply rate below 3%",body:"Shorten copy and personalise opening lines."});
  return r.slice(0,4);
}

// ── Panel renderer ─────────────────────────────────────────────────────────────
function renderContent(id:PanelId,s:AnalyticsStats):React.ReactNode{
  const convRate=s.totalLeads>0?((s.convertedLeads/s.totalLeads)*100).toFixed(1):"0.0";
  const insights=computeInsights(s);
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
    {m:"Conversion", v:Math.min(parseFloat(convRate)*5,100)},
  ];
  const scatter=s.campaignPerf.map(c=>({x:c.openRate,y:c.replyRate,z:Math.max(c.sent||50,20),name:c.name}));
  const treemap=s.pipelineByStage.filter(x=>x.value>0).map(x=>({name:x.stage,size:x.value}));
  const agingC=["#059669","#06B6D4","#F59E0B","#E11D48","#7C0E0E"];
  const hlthC=["#E11D48","#F59E0B","#06B6D4","#059669"];
  const topCamps=[...s.campaignPerf].sort((a,b)=>b.openRate-a.openRate).slice(0,6);
  const openOpps=s.pipelineByStage.filter(x=>!["Won","Lost"].includes(x.stage));

  switch(id){
    // ── Overview ────────────────────────────────────────────────────────────
    case "ov-combo": return(
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-widest mb-1" style={{color:MUTED}}>Overall Engagement</p>
            <p className="text-3xl font-extrabold" style={{color:TEXT}}>{fmt(s.emailsSent)} <span style={{fontSize:16,color:MUTED}}>emails sent</span></p>
          </div>
          <div className="flex items-center gap-4 text-sm" style={{color:MUTED}}>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{background:PAL[0]}}/> Opens</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{background:PAL[1]}}/> Clicks</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{background:PAL[4]}}/> Replies</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={s.engagement} margin={{top:4,right:4,bottom:0,left:-20}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="day" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="opens" name="Opens" fill={`${PAL[0]}20`} stroke={PAL[0]} strokeWidth={0} radius={[4,4,0,0]}/>
            <Line type="monotone" dataKey="clicks"  name="Clicks"  stroke={PAL[1]} strokeWidth={2.5} dot={{r:3,fill:PAL[1]}} activeDot={{r:5}}/>
            <Line type="monotone" dataKey="replies" name="Replies" stroke={PAL[4]} strokeWidth={2.5} dot={{r:3,fill:PAL[4]}} activeDot={{r:5}}/>
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
                {mixData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip content={<Tip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold" style={{color:TEXT}}>{fmt(totalMix)}</span>
            <span className="text-[14px]" style={{color:MUTED}}>total</span>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {mixData.map((d,i)=>{
            const pct=totalMix>0?Math.round((d.value/totalMix)*100):0;
            return(
              <div key={i}>
                <div className="flex justify-between mb-1 text-sm">
                  <span className="font-semibold" style={{color:TEXT}}>{d.name}</span>
                  <span className="font-bold" style={{color:TEXT}}>{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{background:BORDER}}>
                  <div className="h-full rounded-full" style={{width:`${Math.max(pct,2)}%`,background:d.fill}}/>
                </div>
              </div>
            );
          })}
          <div className="pt-3 border-t" style={{borderColor:BORDER}}>
            <button className="w-full py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:PAL[0]}}>View Full Report</button>
          </div>
        </div>
      </div>
    );

    case "ov-leads": return(
      <div>
        {s.leadSources.length===0&&<p className="text-sm text-center py-6" style={{color:MUTED}}>No leads yet</p>}
        <div className="space-y-3">
          {s.leadSources.slice(0,5).map((l,i)=>(
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{background:PAL[i%PAL.length]}}>
                {l.source.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{color:TEXT}}>{l.source}</p>
                <p className="text-[14px]" style={{color:MUTED}}>{l.leads} leads · {l.converted} converted</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold" style={{color:TEXT}}>{fmtK(l.value)}</p>
                <p className="text-[14px]" style={{color:MUTED}}>value</p>
              </div>
            </div>
          ))}
          {s.leadSources.length===0&&[{src:"Email",p:PAL[0]},{src:"Web",p:PAL[1]},{src:"Content",p:PAL[2]}].map((x,i)=>(
            <div key={i} className="flex items-center gap-3 opacity-30">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{background:x.p}}>{x.src[0]}</div>
              <div className="flex-1"><div className="h-3 rounded" style={{background:BORDER,width:"60%"}}/></div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t flex justify-between items-center" style={{borderColor:BORDER}}>
          <span className="text-base font-bold" style={{color:TEXT}}>{fmt(s.totalLeads)} total leads</span>
          <span className="text-base font-semibold" style={{color:PAL[0]}}>See All →</span>
        </div>
      </div>
    );

    case "ov-opps": return(
      <table className="w-full text-sm" style={{borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"#F8F9FB"}}>
            {["#","Opportunity","Stage","Value","Days Open"].map((h,i)=>(
              <th key={i} className="py-2.5 px-4 font-bold uppercase tracking-wider text-left" style={{fontSize:12,color:MUTED}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.topOpportunities.length===0&&<tr><td colSpan={5} className="py-8 text-center" style={{color:MUTED}}>No open opportunities yet</td></tr>}
          {s.topOpportunities.map((o,i)=>(
            <tr key={i} className="border-t transition-colors cursor-pointer hover:bg-blue-50" style={{borderColor:BORDER}}>
              <td className="py-3 px-4 font-bold" style={{color:SOFT}}>{i+1}</td>
              <td className="py-3 px-4 font-semibold" style={{color:"#4F72DE"}}>{o.name}</td>
              <td className="py-3 px-4"><SPill s={o.stage}/></td>
              <td className="py-3 px-4 font-bold" style={{color:TEXT}}>{fmtK(o.value)}</td>
              <td className="py-3 px-4 font-bold" style={{color:o.daysOpen>60?"#E11D48":o.daysOpen>30?"#F59E0B":"#059669"}}>{o.daysOpen}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

    case "ov-insights": return(
      <div className="space-y-2.5">
        {insights.length===0&&<p className="text-sm text-center py-6" style={{color:MUTED}}>Add data to unlock insights.</p>}
        {insights.map((ins,i)=>(
          <div key={i} className="rounded-xl border p-3.5" style={{borderLeftWidth:3,borderLeftColor:ICLR[ins.type]??"#4F72DE",borderColor:BORDER,background:"#FAFBFC"}}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{color:ICLR[ins.type]}}>{ins.icon}</span>
              <span className="text-base font-bold" style={{color:TEXT}}>{ins.title}</span>
            </div>
            <p className="text-[14px] leading-relaxed" style={{color:MUTED}}>{ins.body}</p>
          </div>
        ))}
      </div>
    );

    case "ov-activity": return(
      <div className="space-y-3">
        {s.activityBreakdown.slice(0,5).map((a,i)=>(
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{background:PAL[i%PAL.length]}}>
              <Activity size={12}/>
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold" style={{color:TEXT}}>{a.label}</p>
            </div>
            <span className="text-base font-bold" style={{color:PAL[i%PAL.length]}}>{fmt(a.count)}</span>
          </div>
        ))}
        {s.activityBreakdown.length===0&&<p className="text-sm text-center py-6" style={{color:MUTED}}>No activity data yet</p>}
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
            <div key={i} className="flex items-center gap-3">
              <span className="text-right text-sm font-medium w-28 shrink-0" style={{color:MUTED}}>{x.stage}</span>
              <div className="flex-1 h-8 rounded-xl relative overflow-hidden" style={{background:"#F3F4F6"}}>
                <div className="h-full rounded-xl transition-all duration-500" style={{width:`${Math.max(pct,2)}%`,background:`${c}20`,borderRight:`2px solid ${c}`}}/>
                <span className="absolute inset-0 flex items-center px-3 text-sm font-bold" style={{color:c}}>{x.count} deal{x.count!==1?"s":""}</span>
              </div>
              <span className="w-16 text-right text-sm font-bold shrink-0" style={{color:i===0?SOFT:x.rate>=70?"#059669":x.rate>=40?"#F59E0B":"#E11D48"}}>
                {i===0?"entry":`${x.rate}% conv`}
              </span>
            </div>
          );
        })}
        {s.stageConversion.length===0&&<p className="text-sm text-center py-8" style={{color:MUTED}}>No pipeline data yet</p>}
      </div>
    );

    case "pi-aging": return(
      <>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={s.opportunityAging} margin={{top:4,right:4,bottom:0,left:-20}}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
            <XAxis dataKey="bucket" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="count" name="Deals" radius={[6,6,0,0]}>
              {s.opportunityAging.map((_,i)=><Cell key={i} fill={agingC[i]??MUTED}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-5 gap-1 mt-3">
          {s.opportunityAging.map((a,i)=>(
            <div key={i} className="text-center">
              <div style={{fontSize:13,color:MUTED}}>{a.bucket}</div>
              <div className="text-[14px] font-bold" style={{color:agingC[i]??MUTED}}>{fmtK(a.value)}</div>
            </div>
          ))}
        </div>
      </>
    );

    case "pi-value": return(
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={openOpps} margin={{top:4,right:4,bottom:0,left:-10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="stage" tick={{fontSize:13,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
          <Tooltip content={<Tip/>} formatter={v=>fmtK(Number(v))}/>
          <Bar dataKey="value" name="Value" radius={[6,6,0,0]}>
            {openOpps.map((_,i)=><Cell key={i} fill={PAL[i%PAL.length]}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

    case "pi-opps": return <>{renderContent("ov-opps",s)}</>;

    // ── Revenue ──────────────────────────────────────────────────────────────
    case "rv-forecast": return(
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={s.forecastMonths} margin={{top:4,right:4,bottom:0,left:-10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="month" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false} tickFormatter={v=>fmtK(v)}/>
          <Tooltip content={<Tip/>} formatter={v=>fmtK(Number(v))}/>
          <Bar dataKey="actual"   name="Actual"   fill={`${PAL[1]}25`} stroke={PAL[1]} strokeWidth={1} radius={[6,6,0,0]}/>
          <Bar dataKey="forecast" name="Forecast" fill={`${PAL[0]}15`} stroke={PAL[0]} strokeWidth={1} radius={[6,6,0,0]}/>
          <Line type="monotone" dataKey="quota" name="Quota" stroke={MUTED} strokeWidth={2} strokeDasharray="5 3" dot={false}/>
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
              <Cell fill={PAL[1]}/><Cell fill={PAL[4]}/>
            </Pie>
            <Tooltip content={<Tip/>}/>
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1">
          <p className="text-[14px] font-bold uppercase tracking-widest mb-2.5" style={{color:MUTED}}>By Reason</p>
          {s.winLossReasons.map((r,i)=>(
            <div key={i} className="flex items-center gap-2 mb-1.5 text-sm">
              <span className="flex-1 truncate font-medium" style={{color:TEXT}}>{r.reason}</span>
              <span className="font-bold" style={{color:PAL[1]}}>{r.won}W</span>
              <span className="font-bold" style={{color:PAL[4]}}>{r.lost}L</span>
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
            <div key={i}>
              <div className="flex justify-between mb-1 text-sm">
                <span className="font-semibold" style={{color:TEXT}}>{x.source}</span>
                <span className="font-bold" style={{color:TEXT}}>{fmtK(x.value)}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{background:BORDER}}>
                <div className="h-full rounded-full" style={{width:`${Math.max(pct,2)}%`,background:PAL[i%PAL.length]}}/>
              </div>
              <div className="flex justify-between mt-0.5" style={{fontSize:12,color:MUTED}}>
                <span>{x.leads} leads</span><span>{x.converted} conv.</span>
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
    ):<div className="h-40 flex items-center justify-center text-sm" style={{color:MUTED}}>No pipeline data yet</div>;

    // ── Campaigns ─────────────────────────────────────────────────────────────
    case "ca-bars": return(
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={s.campaignPerf} margin={{top:4,right:4,bottom:0,left:-20}} barGap={6}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="name" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false} unit="%"/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="openRate"  name="Open %"  fill={PAL[0]} radius={[6,6,0,0]}/>
          <Bar dataKey="replyRate" name="Reply %" fill={PAL[3]} radius={[6,6,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    );

    case "ca-radar": return(
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={radar} cx="50%" cy="50%">
          <PolarGrid stroke={GRID_C}/>
          <PolarAngleAxis dataKey="m" tick={{fontSize:12,fill:TICK_C}}/>
          <PolarRadiusAxis angle={90} domain={[0,100]} tick={{fontSize:13,fill:TICK_C}}/>
          <Radar name="Score" dataKey="v" stroke={PAL[0]} fill={PAL[0]} fillOpacity={0.12} strokeWidth={2}/>
          <Tooltip content={<Tip/>}/>
        </RadarChart>
      </ResponsiveContainer>
    );

    case "ca-scatter": return(
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{top:10,right:20,bottom:20,left:-10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="x" name="Open %" type="number" unit="%" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false} label={{value:"Open Rate %",position:"insideBottom",offset:-8,fill:TICK_C,fontSize:12}}/>
          <YAxis dataKey="y" name="Reply %" type="number" unit="%" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false} label={{value:"Reply %",angle:-90,position:"insideLeft",fill:TICK_C,fontSize:12}}/>
          <ZAxis dataKey="z" range={[40,400]}/>
          <Tooltip content={<Tip/>}/>
          <Scatter data={scatter} fill={PAL[0]} fillOpacity={0.5} stroke={PAL[0]} strokeWidth={1}/>
        </ScatterChart>
      </ResponsiveContainer>
    );

    case "ca-stacked": return(
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={s.engagement} margin={{top:4,right:4,bottom:0,left:-20}}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="day" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="opens"   name="Opens"   stackId="a" fill={PAL[0]}/>
          <Bar dataKey="clicks"  name="Clicks"  stackId="a" fill={PAL[1]}/>
          <Bar dataKey="replies" name="Replies" stackId="a" fill={PAL[3]} radius={[6,6,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    );

    case "ca-leader": return(
      <table className="w-full text-sm" style={{borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"#F8F9FB"}}>
            {["Rank","Campaign","Open Rate","Reply Rate","Sent"].map((h,i)=>(
              <th key={i} className="py-2.5 px-4 font-bold uppercase tracking-wider text-left" style={{fontSize:12,color:MUTED}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topCamps.map((c,i)=>(
            <tr key={i} className="border-t transition-colors cursor-pointer" style={{borderColor:BORDER}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="#F0F4FF"} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=""}>
              <td className="py-3 px-4 font-bold" style={{color:i===0?"#F59E0B":MUTED}}>{i+1}</td>
              <td className="py-3 px-4 font-semibold" style={{color:"#4F72DE"}}>{c.name}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full" style={{background:BORDER}}>
                    <div className="h-full rounded-full" style={{width:`${Math.min(c.openRate,100)}%`,background:PAL[0]}}/>
                  </div>
                  <span className="font-bold" style={{color:TEXT}}>{c.openRate}%</span>
                </div>
              </td>
              <td className="py-3 px-4 font-bold" style={{color:PAL[3]}}>{c.replyRate}%</td>
              <td className="py-3 px-4" style={{color:MUTED}}>{fmt(c.sent)}</td>
            </tr>
          ))}
          {topCamps.length===0&&<tr><td colSpan={5} className="py-8 text-center" style={{color:MUTED}}>No campaigns yet</td></tr>}
        </tbody>
      </table>
    );

    // ── Activity ──────────────────────────────────────────────────────────────
    case "ac-heatmap": return <Heatmap data={s.heatmap}/>;

    case "ac-pie": return(
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={actPie} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="count" startAngle={90} endAngle={-270}>
                {actPie.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip content={<Tip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-extrabold" style={{color:TEXT}}>{fmt(s.activityBreakdown.reduce((a,x)=>a+x.count,0))}</span>
            <span style={{fontSize:12,color:MUTED}}>total</span>
          </div>
        </div>
        <div className="w-full space-y-1.5">
          {actPie.slice(0,5).map((d,i)=>(
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full shrink-0" style={{background:d.fill,display:"inline-block"}}/>
              <span className="flex-1 truncate font-medium" style={{color:TEXT}}>{d.label}</span>
              <span className="font-bold" style={{color:TEXT}}>{fmt(d.count)}</span>
            </div>
          ))}
        </div>
      </div>
    );

    case "ac-trend": return(
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={s.engagement.slice(-7)} margin={{top:4,right:4,bottom:0,left:-20}}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PAL[0]} stopOpacity={0.2}/><stop offset="100%" stopColor={PAL[0]} stopOpacity={0}/></linearGradient>
            <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PAL[1]} stopOpacity={0.2}/><stop offset="100%" stopColor={PAL[1]} stopOpacity={0}/></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="day" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
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
          <XAxis dataKey="label" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="count" name="Count" radius={[6,6,0,0]}>
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
                {s.accountHealthDist.map((_,i)=><Cell key={i} fill={hlthC[i]}/>)}
              </Pie>
              <Tooltip content={<Tip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold" style={{color:TEXT}}>{fmt(s.totalLeads)}</span>
            <span style={{fontSize:12,color:MUTED}}>total</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {s.accountHealthDist.map((d,i)=>(
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:hlthC[i],display:"inline-block"}}/>
              <span className="flex-1 font-medium" style={{color:TEXT}}>{d.bucket}</span>
              <span className="font-bold" style={{color:TEXT}}>{d.count}</span>
              <span style={{color:MUTED}}>{s.totalLeads>0?`${Math.round((d.count/s.totalLeads)*100)}%`:"0%"}</span>
            </div>
          ))}
        </div>
      </div>
    );

    case "aa-sources": return <>{renderContent("rv-sources",s)}</>;

    case "aa-score": return(
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={s.leadScoreDist} margin={{top:4,right:4,bottom:0,left:-20}}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_C}/>
          <XAxis dataKey="bucket" tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fill:TICK_C}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="count" name="Leads" radius={[6,6,0,0]}>
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
                {mixData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip content={<Tip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold" style={{color:TEXT}}>{fmt(totalMix)}</span>
            <span style={{fontSize:12,color:MUTED}}>total</span>
          </div>
        </div>
        <div className="space-y-2.5">
          {mixData.map((d,i)=>(
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <span className="w-2 h-2 rounded-full" style={{background:d.fill,display:"inline-block"}}/>
              <span className="w-14" style={{color:MUTED}}>{d.name}</span>
              <span className="font-bold" style={{color:TEXT}}>{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );

    default: return <p className="text-sm text-center py-6" style={{color:MUTED}}>Panel not found</p>;
  }
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
const TABS:{id:TabId;label:string}[]=[
  {id:"overview",  label:"Overview"},
  {id:"pipeline",  label:"Pipeline"},
  {id:"revenue",   label:"Revenue"},
  {id:"campaigns", label:"Campaigns"},
  {id:"activity",  label:"Activity"},
  {id:"accounts",  label:"Accounts"},
];

// ── KPIs per tab ───────────────────────────────────────────────────────────────
function getKPIs(tab:TabId, s:AnalyticsStats):KPI[]{
  const convRate=s.totalLeads>0?((s.convertedLeads/s.totalLeads)*100).toFixed(1):"0.0";
  switch(tab){
    case "overview": return[
      {label:"Emails Sent",   value:fmt(s.emailsSent),      sub:"all campaigns",    icon:<Mail size={20}/>,       colorIdx:0},
      {label:"Open Rate",     value:`${s.openRate}%`,        sub:"avg open rate",    icon:<MailOpen size={20}/>,   colorIdx:1, trend:s.openRate>20?5:-3},
      {label:"Hot Leads",     value:fmt(s.hotLeads),         sub:`of ${fmt(s.totalLeads)}`,icon:<Flame size={20}/>,colorIdx:2},
      {label:"Won Revenue",   value:fmtK(s.wonRevenue),      sub:"this period",      icon:<Trophy size={20}/>,     colorIdx:3},
    ];
    case "pipeline": return[
      {label:"Open Pipeline", value:fmtK(s.pipelineTotal),  sub:"total open",       icon:<TrendingUp size={20}/>,colorIdx:0},
      {label:"Open Deals",    value:fmt(s.pipelineByStage.filter(x=>!["Won","Lost"].includes(x.stage)).reduce((a,x)=>a+x.count,0)),sub:"active",icon:<BarChart2 size={20}/>,colorIdx:1},
      {label:"Deal Velocity", value:`${s.dealVelocity}d`,   sub:"avg days open",    icon:<Clock size={20}/>,      colorIdx:s.dealVelocity>60?3:2},
      {label:"Win Rate",      value:`${s.winRate.toFixed(0)}%`,sub:"closed won",    icon:<Target size={20}/>,     colorIdx:4},
    ];
    case "revenue": return[
      {label:"Won Revenue",   value:fmtK(s.wonRevenue),      sub:"this period",      icon:<DollarSign size={20}/>,colorIdx:4},
      {label:"Avg Deal",      value:fmtK(s.avgDealValue),    sub:"average deal size",icon:<Trophy size={20}/>,    colorIdx:0},
      {label:"Quota",         value:`${s.quotaAttainment}%`, sub:"attainment",       icon:<Target size={20}/>,    colorIdx:s.quotaAttainment>=80?4:s.quotaAttainment>=50?3:5},
      {label:"Coverage",      value:`${s.pipelineCoverage}×`,sub:"pipeline ratio",  icon:<TrendingUp size={20}/>,colorIdx:1},
    ];
    case "campaigns": return[
      {label:"Campaigns",     value:fmt(s.campaignPerf.length),sub:"total",          icon:<Mail size={20}/>,       colorIdx:0},
      {label:"Avg Open Rate", value:`${s.openRate}%`,          sub:"across all",    icon:<MailOpen size={20}/>,   colorIdx:1},
      {label:"Avg Reply Rate",value:`${s.replyRate}%`,         sub:"across all",    icon:<Reply size={20}/>,      colorIdx:2},
      {label:"Emails Sent",   value:fmt(s.emailsSent),         sub:"total",         icon:<Zap size={20}/>,        colorIdx:3},
    ];
    case "activity": return[
      {label:"Total Events",  value:fmt(s.activityBreakdown.reduce((a,x)=>a+x.count,0)),sub:"all time",icon:<Activity size={20}/>,colorIdx:0},
      {label:"Total Leads",   value:fmt(s.totalLeads),         sub:"in system",     icon:<Users size={20}/>,      colorIdx:1},
      {label:"Hot Leads",     value:fmt(s.hotLeads),           sub:"high intent",   icon:<Flame size={20}/>,      colorIdx:2},
      {label:"Click Rate",    value:`${s.clickRate}%`,         sub:"avg click rate",icon:<Globe size={20}/>,      colorIdx:3},
    ];
    case "accounts": return[
      {label:"Total Leads",   value:fmt(s.totalLeads),         sub:"in CRM",        icon:<Users size={20}/>,      colorIdx:0},
      {label:"Hot Leads",     value:fmt(s.hotLeads),           sub:"high intent",   icon:<Flame size={20}/>,      colorIdx:1},
      {label:"Converted",     value:fmt(s.convertedLeads),     sub:"converted",     icon:<CheckCircle2 size={20}/>,colorIdx:4},
      {label:"Conv. Rate",    value:`${convRate}%`,            sub:"conv. rate",    icon:<Target size={20}/>,     colorIdx:2},
    ];
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AnalyticsView({stats:initial}:{stats:AnalyticsStats}){
  const [stats,      setStats     ] = useState(initial);
  const [tab,        setTab       ] = useState<TabId>("overview");
  const [range,      setRange     ] = useState("30");
  const [loading,    setLoading   ] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart,setCustomStart]=useState("");
  const [customEnd,  setCustomEnd ]  = useState(today());
  const [customizing,setCustomizing] = useState(false);
  const [showReport, setShowReport]  = useState(false);
  const [cfg,        setCfg       ] = useState<PanelCfg>(loadCfg);
  const [dragging,   setDragging  ] = useState<string|null>(null);
  const [dragOver,   setDragOver  ] = useState<string|null>(null);
  const prevRange=useRef(range);

  useEffect(()=>{saveCfg(cfg);},[cfg]);

  useEffect(()=>{
    if(prevRange.current===range)return;
    prevRange.current=range;
    if(range==="custom"){setCustomOpen(true);return;}
    setLoading(true);
    getAnalyticsStatsRanged(Number(range)).then(setStats).finally(()=>setLoading(false));
  },[range]);

  async function applyCustom(){
    if(!customStart||!customEnd)return;
    setCustomOpen(false);setLoading(true);
    try{setStats(await getAnalyticsStatsCustom(customStart,customEnd));}finally{setLoading(false);}
  }

  function exportCSV(){
    const rows=[
      ["Emails Sent",s.emailsSent],["Open Rate %",s.openRate],["Reply Rate %",s.replyRate],
      ["Total Leads",s.totalLeads],["Hot Leads",s.hotLeads],["Pipeline",s.pipelineTotal],
      ["Won Revenue",s.wonRevenue],["Win Rate %",s.winRate],["Quota %",s.quotaAttainment],
    ];
    const c=[["Metric","Value"],...rows].map(r=>r.map(csv).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([c],{type:"text/csv"}));
    a.download=`nxelio-analytics-${today()}.csv`;a.click();
  }

  function getPanels(t:TabId):PanelId[]{
    return(cfg.order[t]??DEFAULT_PANELS[t]).filter(id=>!cfg.hidden.includes(id));
  }
  function hidePanel(id:PanelId){setCfg(p=>({...p,hidden:[...p.hidden,id]}));}
  function showPanel(id:PanelId){setCfg(p=>({...p,hidden:p.hidden.filter(h=>h!==id)}));}
  function resetLayout(){setCfg({order:{...DEFAULT_PANELS}as Record<TabId,PanelId[]>,hidden:[]});setCustomizing(false);}
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

  const s=stats;
  const kpis=getKPIs(tab,s);
  const visiblePanels=getPanels(tab);
  const hiddenInTab=(DEFAULT_PANELS[tab]??[]).filter(id=>cfg.hidden.includes(id));
  const attColor=s.quotaAttainment>=80?"#059669":s.quotaAttainment>=50?"#F59E0B":"#E11D48";

  return(
    <div style={{background:BG,margin:"-20px -24px",minHeight:"100vh"}}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{background:WHITE,borderBottom:`1px solid ${BORDER}`,boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{background:"#4F72DE"}}>
              <BarChart2 size={17}/>
            </div>
            <div>
              <h1 className="font-extrabold text-sm" style={{color:TEXT}}>Nxelio Analytics</h1>
              <p style={{fontSize:13,color:MUTED}}>CRM Intelligence Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loading&&<span className="text-sm flex items-center gap-1.5" style={{color:PAL[0]}}><span className="w-3 h-3 rounded-full border-2 border-[#4F72DE] border-t-transparent animate-spin inline-block"/>Updating…</span>}

            {/* Range selector */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm" style={{borderColor:BORDER,color:TEXT,background:WHITE}}>
              <Clock size={11} style={{color:MUTED}}/>
              <select value={range} onChange={e=>setRange(e.target.value)} style={{border:"none",outline:"none",background:"transparent",fontSize:12,color:TEXT,cursor:"pointer",appearance:"none",paddingRight:14}}>
                <option value="7">Last 7 Days</option>
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range…</option>
              </select>
              <ChevronDown size={10} style={{color:MUTED,marginLeft:-10}}/>
            </div>

            {/* Customize */}
            <button onClick={()=>setCustomizing(p=>!p)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all" style={{borderColor:customizing?"#4F72DE":BORDER,background:customizing?"#EEF2FF":WHITE,color:customizing?"#4F72DE":MUTED}}>
              <Settings2 size={12}/>{customizing?"Editing":"Customize"}
            </button>

            {/* Export */}
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all" style={{borderColor:BORDER,color:MUTED,background:WHITE}}>
              <Download size={12}/>Export
            </button>

            {/* Generate Report */}
            <button onClick={()=>setShowReport(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#1C1C2B"}}>
              <FileText size={12}/>Generate Report
            </button>
          </div>
        </div>

        {/* Quota bar */}
        <div className="px-6 py-2.5 border-t flex items-center gap-6" style={{borderColor:BORDER,background:"#FAFBFC"}}>
          <div className="flex items-center gap-2">
            <span style={{fontSize:13,color:MUTED,fontWeight:600}}>Quota Attainment</span>
            <div className="w-32 h-2 rounded-full overflow-hidden" style={{background:BORDER}}>
              <div className="h-full rounded-full" style={{width:`${s.quotaAttainment}%`,background:attColor}}/>
            </div>
            <span className="text-base font-bold" style={{color:attColor}}>{s.quotaAttainment}%</span>
          </div>
          {[
            {l:"Won",   v:fmtK(s.wonRevenue),   c:PAL[1]},
            {l:"Target",v:fmtK(s.quotaTarget),  c:PAL[0]},
            {l:"Pipeline coverage",v:`${s.pipelineCoverage}×`,c:PAL[5]},
            {l:"Deal velocity",v:`${s.dealVelocity}d`,c:PAL[2]},
          ].map((x,i)=>(
            <div key={i} className="flex items-center gap-1.5">
              <span style={{fontSize:13,color:MUTED}}>{x.l}:</span>
              <span className="text-base font-bold" style={{color:x.c}}>{x.v}</span>
            </div>
          ))}
          <div className="ml-auto">
            <span className="text-[14px] font-bold px-2.5 py-1 rounded-full" style={{background:`${attColor}12`,color:attColor}}>
              {s.quotaAttainment>=80?"On Track":s.quotaAttainment>=50?"At Risk":"Behind"}
            </span>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex items-center px-4 pt-1 pb-0 gap-1 border-t" style={{borderColor:BORDER}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className="px-4 py-2 rounded-t-xl text-sm font-semibold transition-all"
              style={{background:tab===t.id?PILL_BG:WHITE,color:tab===t.id?"#FFFFFF":MUTED,borderBottom:tab===t.id?"2px solid transparent":"none"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Customize toolbar ────────────────────────────────────────────────── */}
      {customizing&&(
        <div className="flex items-center justify-between px-6 py-2 border-b" style={{background:"#EEF2FF",borderColor:"#C7D2FE"}}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-bold" style={{color:"#4F72DE"}}>Customize Layout</span>
            <span style={{fontSize:13,color:MUTED}}>Drag to reorder · click <EyeOff size={10} className="inline mb-0.5"/> to hide</span>
            {hiddenInTab.map(id=>(
              <button key={id} onClick={()=>showPanel(id)} className="flex items-center gap-1 text-[14px] px-2.5 py-1 rounded-full border transition-colors" style={{borderColor:"#93C5FD",color:"#4F72DE",background:WHITE}}>
                <Eye size={10}/>{PM[id]?.title??id}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetLayout} className="text-sm px-3 py-1 rounded-xl border transition-colors" style={{borderColor:BORDER,color:MUTED,background:WHITE}}>Reset</button>
            <button onClick={()=>setCustomizing(false)} className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-xl text-white font-semibold" style={{background:"#4F72DE"}}>
              <X size={11}/>Done
            </button>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 flex flex-col gap-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpis.map((k,i)=><KPICard key={i} {...k}/>)}
        </div>

        {/* Panel grid */}
        <div className="flex flex-wrap gap-4">
          {visiblePanels.map(id=>{
            const meta=PM[id];
            if(!meta)return null;
            const isHalf=meta.span==="half";
            const isDragging=dragging===id;
            const isDragOver=dragOver===id;
            const noPad=["ov-opps","pi-opps","ca-leader"].includes(id);
            return(
              <div key={id} className="shrink-0" style={{width:isHalf?"calc(50% - 8px)":"100%"}}
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
                >
                  {renderContent(id,s)}
                </WCard>
              </div>
            );
          })}

          {visiblePanels.length===0&&(
            <div className="w-full flex flex-col items-center justify-center py-20" style={{color:MUTED}}>
              <EyeOff size={32} className="mb-3 opacity-30"/>
              <p className="font-semibold mb-1" style={{color:TEXT}}>All panels are hidden</p>
              <p className="text-sm mb-4">Click the panel badges above to show them again</p>
              <button onClick={resetLayout} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{background:"#4F72DE"}}>
                <RotateCcw size={13}/>Reset to default
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Custom date modal ─────────────────────────────────────────────────── */}
      <Modal open={customOpen} onClose={()=>{setCustomOpen(false);setRange("30");}}>
        <div className="p-6 flex flex-col gap-5">
          <h2 className="text-base font-bold" style={{color:TEXT}}>Custom Date Range</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {label:"From",val:customStart,set:setCustomStart,max:customEnd,min:undefined},
              {label:"To",  val:customEnd,  set:setCustomEnd,  max:today(),   min:customStart},
            ].map((f,i)=>(
              <div key={i}>
                <label className="block text-[14px] font-bold uppercase tracking-widest mb-1.5" style={{color:MUTED}}>{f.label}</label>
                <input type="date" value={f.val} onChange={e=>f.set(e.target.value)} max={f.max} min={f.min}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-300 focus:border-blue-400" style={{borderColor:BORDER,color:TEXT}}/>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={()=>{setCustomOpen(false);setRange("30");}} className="flex-1 border rounded-xl py-2 text-sm font-semibold transition-all" style={{borderColor:BORDER,color:MUTED}}>Cancel</button>
            <button onClick={applyCustom} disabled={!customStart||!customEnd} className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-40 transition-all" style={{background:"#4F72DE"}}>Apply</button>
          </div>
        </div>
      </Modal>

      {/* ── Generate Report modal ─────────────────────────────────────────────── */}
      <Modal open={showReport} onClose={()=>setShowReport(false)}>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{background:"#1C1C2B"}}><FileText size={16}/></div>
            <div>
              <h2 className="text-base font-extrabold" style={{color:TEXT}}>Analytics Report</h2>
              <p style={{fontSize:13,color:MUTED}}>Summary for the selected period</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              {label:"Emails Sent",    value:fmt(s.emailsSent),            color:PAL[0]},
              {label:"Open Rate",      value:`${s.openRate}%`,             color:PAL[1]},
              {label:"Reply Rate",     value:`${s.replyRate}%`,            color:PAL[2]},
              {label:"Hot Leads",      value:fmt(s.hotLeads),              color:"#F59E0B"},
              {label:"Pipeline",       value:fmtK(s.pipelineTotal),        color:PAL[0]},
              {label:"Won Revenue",    value:fmtK(s.wonRevenue),           color:PAL[1]},
              {label:"Win Rate",       value:`${s.winRate.toFixed(0)}%`,   color:PAL[4]},
              {label:"Quota Attained", value:`${s.quotaAttainment}%`,      color:attColor},
            ].map((x,i)=>(
              <div key={i} className="rounded-xl p-3 border" style={{borderColor:BORDER,background:"#FAFBFC"}}>
                <p style={{fontSize:12,color:MUTED,fontWeight:600,marginBottom:2}}>{x.label}</p>
                <p className="text-xl font-extrabold" style={{color:x.color}}>{x.value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={()=>setShowReport(false)} className="flex-1 border rounded-xl py-2 text-sm font-semibold" style={{borderColor:BORDER,color:MUTED}}>Close</button>
            <button onClick={()=>{exportCSV();setShowReport(false);}} className="flex-1 rounded-xl py-2 text-sm font-bold text-white" style={{background:"#1C1C2B"}}>
              Export CSV
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
