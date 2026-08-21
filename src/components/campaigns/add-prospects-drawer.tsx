"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users2, ShoppingCart, Pencil, FileSpreadsheet, Layers3, Megaphone,
  Loader2, AlertCircle, Plus, Trash2, Upload, ExternalLink,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { bulkInsertLeads, type LeadRow } from "@/lib/queries/leads";
import { getSegmentMemberLeads, type SegmentRow } from "@/lib/queries/segments";
import { searchBuyLeads, type GeneratedProspect } from "@/lib/leads/buy-leads";
import { hasFeature, getMaxBuyLeadsCount, canAffordLeads, deductLeads } from "@/lib/queries/subscriptions";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import { BuyForm, parseCsv, type BuyState, type CsvRow } from "@/components/leads/add-leads-wizard";
import { getEnrolledLeads, addProspectsToCampaign } from "@/lib/campaigns/enrollment";
import type { CampaignRow } from "@/lib/queries/campaigns";

type SourceMode = "buy" | "manual" | "csv" | "segment" | "campaign";

const SOURCE_OPTIONS: { id: SourceMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "buy", label: "Buy Leads", icon: ShoppingCart },
  { id: "manual", label: "Manual Entry", icon: Pencil },
  { id: "csv", label: "Upload CSV", icon: FileSpreadsheet },
  { id: "segment", label: "Existing Segment", icon: Layers3 },
  { id: "campaign", label: "Existing Campaign", icon: Megaphone },
];

interface ManualRow { id: string; name: string; email: string; company: string }
let _rid = 0;
const newManualRow = (): ManualRow => ({ id: `r${++_rid}`, name: "", email: "", company: "" });

export function AddProspectsDrawer({
  open, onClose, campaignId, segmentId, audienceLabel, segments, campaigns, leadStatsTotal,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  segmentId: string | null;
  audienceLabel: string;
  segments: (SegmentRow & { contacts: number })[];
  campaigns: CampaignRow[];
  leadStatsTotal: number;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<SourceMode>("manual");
  const [error, setError] = useState<string | null>(null);

  // Manual entry
  const [rows, setRows] = useState<ManualRow[]>([newManualRow()]);

  // CSV
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvName, setCsvName] = useState("");

  // Buy leads
  const [buy, setBuy] = useState<BuyState>({ industry: "", role: "", locations: [], count: 10, companySize: "Any", seniority: "Any", requireVerifiedEmail: false });
  const [buyResults, setBuyResults] = useState<GeneratedProspect[] | null>(null);
  const [buySource, setBuySource] = useState<"brightdata" | "anysite" | "ai" | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [maxBuyCount, setMaxBuyCount] = useState(100);
  const [buyLocked, setBuyLocked] = useState(false);

  // Segment / Campaign pickers
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    hasFeature("discovery").then((d) => setBuyLocked(!d)).catch(() => {});
    getMaxBuyLeadsCount().then((max) => { setMaxBuyCount(max); setBuy((b) => ({ ...b, count: Math.min(b.count, max) })); }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the drawer each time it reopens
      setMode("manual"); setError(null);
      setRows([newManualRow()]);
      setCsvRows(null); setCsvName("");
      setBuyResults(null); setBuySource(null);
      setSelectedSegmentId(null); setSelectedCampaignId(null);
    }
  }, [open]);

  if (!open) return null;

  function updateRow(id: string, key: keyof ManualRow, value: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  async function finish(convertedSegmentToStatic: boolean, created: number, skipped: number, locked?: boolean) {
    if (locked) {
      setError("This campaign has already launched — its audience is locked and can't be added to.");
      return;
    }
    if (convertedSegmentToStatic) toast(`"${audienceLabel}" was a dynamic segment — converted it to static so these manually added prospects aren't removed on the next refresh.`, "info");
    toast(`${created} prospect${created === 1 ? "" : "s"} added to this campaign${skipped ? ` (${skipped} already were)` : ""}.`, "success");
    onClose();
    router.refresh();
  }

  function handleManualSubmit() {
    const valid = rows.filter((r) => (r.name.trim() || r.company.trim()) && r.email.trim());
    if (!valid.length) { setError("Each row needs a name (or company) and an email."); return; }
    setError(null);
    start(async () => {
      const res = await bulkInsertLeads(
        valid.map((r) => ({ full_name: r.name.trim() || null, email: r.email.trim(), company_name: r.company.trim() || null, source: "Manual Entry", status: "New" })),
        { defaultSource: "Manual Entry" }
      );
      if (res.error) { setError(res.error); return; }
      // bulkInsertLeads doesn't return the inserted rows, so re-fetch by email to enroll them.
      const { getLeads } = await import("@/lib/queries/leads");
      const allLeads = await getLeads();
      const emails = new Set(valid.map((r) => r.email.trim().toLowerCase()));
      const inserted = allLeads.filter((l) => l.email && emails.has(l.email.toLowerCase()));
      const { convertedSegmentToStatic, created, skipped, locked } = await addProspectsToCampaign(campaignId, segmentId, inserted);
      finish(convertedSegmentToStatic, created, skipped, locked);
    });
  }

  function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Please choose a .csv file"); return; }
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Failed to read file");
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.length) { setError("CSV is empty or could not be parsed"); return; }
      setCsvRows(parsed);
    };
    reader.readAsText(file);
  }

  function handleCsvSubmit() {
    const valid = (csvRows ?? []).filter((r) => r._valid);
    if (!valid.length) { setError("No valid rows to import."); return; }
    setError(null);
    start(async () => {
      const res = await bulkInsertLeads(
        valid.map((r) => ({ ...r, source: "CSV Upload", status: "New" })),
        { defaultSource: "CSV Upload" }
      );
      if (res.error) { setError(res.error); return; }
      const { getLeads } = await import("@/lib/queries/leads");
      const allLeads = await getLeads();
      const emails = new Set(valid.map((r) => r.email?.toLowerCase()).filter(Boolean));
      const inserted = allLeads.filter((l) => l.email && emails.has(l.email.toLowerCase()));
      const { convertedSegmentToStatic, created, skipped, locked } = await addProspectsToCampaign(campaignId, segmentId, inserted);
      finish(convertedSegmentToStatic, created, skipped, locked);
    });
  }

  function runBuySearch() {
    setError(null);
    setBuyLoading(true);
    setBuyResults(null);
    searchBuyLeads(buy)
      .then((res) => {
        if (!res.ok) { setError(res.error || "Could not find prospects."); return; }
        setBuyResults(res.prospects);
        setBuySource(res.source ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Search failed"))
      .finally(() => setBuyLoading(false));
  }

  function handleBuySubmit() {
    if (!buyResults?.length) { setError("Find prospects first."); return; }
    setError(null);
    start(async () => {
      if (!(await canAffordLeads(buyResults.length))) {
        setError("You don't have enough leads remaining on your plan this cycle.");
        return;
      }
      const buyLabel = buySource === "brightdata" || buySource === "anysite" ? "Purchased Leads" : "Purchased Leads (sample)";
      const res = await bulkInsertLeads(
        buyResults.map((p) => ({
          full_name: p.full_name || null, company_name: p.company_name || null, industry: p.industry || null,
          job_title: p.title || null, seniority: p.seniority || null, email: p.email || null,
          email_verification_status: p.emailVerificationStatus || null, linkedin: p.linkedin || null,
          website_url: p.website_url || null, source: buyLabel, status: "New",
        })),
        { defaultSource: buyLabel }
      );
      if (res.error) { setError(res.error); return; }
      if (res.inserted > 0) {
        try {
          const d = await deductLeads(res.inserted, { source: "buy_leads" });
          if (d.ok) notifyCreditsChanged();
        } catch { /* best-effort */ }
      }
      const { getLeads } = await import("@/lib/queries/leads");
      const allLeads = await getLeads();
      const emails = new Set(buyResults.map((p) => p.email?.toLowerCase()).filter(Boolean));
      const inserted = allLeads.filter((l) => l.email && emails.has(l.email.toLowerCase()));
      const { convertedSegmentToStatic, created, skipped, locked } = await addProspectsToCampaign(campaignId, segmentId, inserted);
      finish(convertedSegmentToStatic, created, skipped, locked);
    });
  }

  function handleSegmentSubmit() {
    if (!selectedSegmentId) { setError("Choose a segment first."); return; }
    setError(null);
    start(async () => {
      const members = await getSegmentMemberLeads(selectedSegmentId);
      const { convertedSegmentToStatic, created, skipped, locked } = await addProspectsToCampaign(campaignId, segmentId, members);
      finish(convertedSegmentToStatic, created, skipped, locked);
    });
  }

  function handleCampaignSubmit() {
    if (!selectedCampaignId) { setError("Choose a campaign first."); return; }
    setError(null);
    start(async () => {
      const enrolled = await getEnrolledLeads<LeadRow>(selectedCampaignId);
      if (!enrolled || !enrolled.length) { setError("That campaign has no enrolled prospects yet (it may not have launched)."); return; }
      const { convertedSegmentToStatic, created, skipped, locked } = await addProspectsToCampaign(campaignId, segmentId, enrolled);
      finish(convertedSegmentToStatic, created, skipped, locked);
    });
  }

  const csvValid = csvRows?.filter((r) => r._valid).length ?? 0;
  const csvInvalid = (csvRows?.length ?? 0) - csvValid;

  return (
    <Modal open={open} onClose={onClose} title="Add prospects" description="Bring more prospects into this campaign's audience." size="lg" variant="side">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Add via</label>
          <Select value={mode} onChange={(e) => { setMode(e.target.value as SourceMode); setError(null); }}>
            {SOURCE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Each row needs a name (or company) and an email.</p>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <Input value={r.name} onChange={(e) => updateRow(r.id, "name", e.target.value)} placeholder="Name" />
                  <Input value={r.email} onChange={(e) => updateRow(r.id, "email", e.target.value)} placeholder="Email" />
                  <Input value={r.company} onChange={(e) => updateRow(r.id, "company", e.target.value)} placeholder="Company" />
                  <button onClick={() => setRows(rows.length === 1 ? [newManualRow()] : rows.filter((x) => x.id !== r.id))} className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, newManualRow()])}><Plus className="h-4 w-4" /> Add another</Button>
          </div>
        )}

        {mode === "csv" && (
          <div className="space-y-3">
            <input type="file" accept=".csv,text/csv" id="drawer-csv-input" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            {!csvRows ? (
              <label htmlFor="drawer-csv-input" className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl p-10 text-center block cursor-pointer">
                <Upload className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="font-medium text-slate-900 text-sm">Choose a CSV file</p>
                <p className="text-xs text-slate-500 mt-1">Needs a name/company and an email/website column.</p>
              </label>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                <div className="flex-1">
                  <p className="font-medium text-slate-900 text-sm">{csvName}</p>
                  <p className="text-xs text-slate-500">{csvValid} valid · {csvInvalid} skipped</p>
                </div>
                <button onClick={() => { setCsvRows(null); setCsvName(""); }} className="text-xs text-slate-500 hover:text-slate-700 underline">Choose different file</button>
              </div>
            )}
          </div>
        )}

        {mode === "buy" && (
          buyLocked ? (
            <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">Buy Leads isn&apos;t included on your plan — upgrade to unlock it.</div>
          ) : (
            <BuyForm buy={buy} setBuy={(b) => { setBuy(b); setBuyResults(null); setBuySource(null); }} results={buyResults} source={buySource} loading={buyLoading} onGenerate={runBuySearch} error={null} maxCount={maxBuyCount} />
          )
        )}

        {mode === "segment" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-600">Pick a segment — all its members get added to this campaign.</p>
              <a href="/segments/builder" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 whitespace-nowrap">
                <ExternalLink className="h-3 w-3" /> Create new
              </a>
            </div>
            {segments.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 text-center">No segments yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-auto">
                {segments.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSegmentId(s.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${selectedSegmentId === s.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="flex items-center gap-2 min-w-0"><Layers3 className="h-4 w-4 text-slate-400 flex-shrink-0" /> <span className="truncate text-sm font-medium text-slate-900">{s.segment_name}</span></span>
                    <Badge variant="default">{s.contacts.toLocaleString()} leads</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "campaign" && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 mb-1">Pick another campaign — its enrolled prospects get added to this one.</p>
            {campaigns.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 text-center">No other campaigns yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-auto">
                {campaigns.filter((c) => c.id !== campaignId).map((c) => {
                  const seg = c.segment_id ? segments.find((s) => s.id === c.segment_id) : null;
                  const leadsCount = seg ? seg.contacts : leadStatsTotal;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCampaignId(c.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${selectedCampaignId === c.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-2 min-w-0"><Megaphone className="h-4 w-4 text-slate-400 flex-shrink-0" /> <span className="truncate text-sm font-medium text-slate-900">{c.campaign_name}</span></span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="default">{leadsCount.toLocaleString()} leads</Badge>
                        <Badge variant="info">{Number(c.reply_rate || 0)}% reply rate</Badge>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-5 border-t border-slate-100 flex justify-end gap-2 mt-auto">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button
          onClick={
            mode === "manual" ? handleManualSubmit
            : mode === "csv" ? handleCsvSubmit
            : mode === "buy" ? handleBuySubmit
            : mode === "segment" ? handleSegmentSubmit
            : handleCampaignSubmit
          }
          disabled={pending || (mode === "buy" && buyLocked)}
        >
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : <><Users2 className="h-4 w-4" /> Add to campaign</>}
        </Button>
      </div>
    </Modal>
  );
}
