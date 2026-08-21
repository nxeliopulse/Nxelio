"use client";
import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X, Search, Megaphone, MailCheck, FileSpreadsheet, Pencil, ShoppingCart,
  ArrowLeft, ArrowRight, Loader2, Check, CheckCircle2, AlertCircle, AlertTriangle,
  Upload, Plus, Trash2, Users2, Link2, RefreshCw, ExternalLink, Sparkles,
  Building2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useFeedback } from "@/components/ui/feedback";
import { bulkInsertLeads, type LeadRow } from "@/lib/queries/leads";
import { importLinkedInLeads, hasLinkedInAccount } from "@/lib/leads/linkedin-import";
import { connectOutreachAccount, syncOutreachAccounts } from "@/lib/queries/outreach-accounts";
import {
  searchBuyLeads, searchPeopleAtCompanies, purchaseCompanyWiseLeads, importGeneratedProspects,
  type GeneratedProspect, type CompanyPeopleCriteria,
} from "@/lib/leads/buy-leads";
import { createLeadSearchJob } from "@/lib/leads/lead-search-jobs";
import { LINKEDIN_INDUSTRIES, COMMON_ROLES } from "@/lib/leads/buy-leads-options";
import { MultiLocationInput } from "@/components/leads/location-search-input";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { hasFeature, getMaxBuyLeadsCount } from "@/lib/queries/subscriptions";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import { getPicklistValues } from "@/lib/queries/picklists";
import { cn } from "@/lib/utils";
import { PhoneInput, formatPhoneForStorage, isPhoneValid, detectCountry, type CountryCode } from "@/components/ui/phone-input";

export type SourceId = "linkedin-search" | "linkedin-post" | "verified-emails" | "manual" | "buy" | "csv";

interface SourceDef {
  id: SourceId;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
  /** Plan feature this source requires — undefined means available on every plan. */
  featureFlag?: "discovery";
}

const SOURCES: SourceDef[] = [
  { id: "linkedin-search", label: "Basic LinkedIn Search", desc: "Add profiles from the free LinkedIn search page", icon: Search, color: "text-blue-600 bg-blue-50" },
  { id: "linkedin-post", label: "LinkedIn Post", desc: "Capture people who engaged with a post", icon: Megaphone, color: "text-sky-600 bg-sky-50", badge: "New" },
  { id: "verified-emails", label: "Verified Emails", desc: "Get real prospects that always come with a verified email", icon: MailCheck, color: "text-red-600 bg-red-50", featureFlag: "discovery" },
  { id: "manual", label: "Add Leads Manually", desc: "Type in leads one by one with full details", icon: Pencil, color: "text-indigo-600 bg-indigo-50" },
  { id: "buy", label: "Buy Leads", desc: "Find real prospects by industry, role & location", icon: ShoppingCart, color: "text-amber-600 bg-amber-50", featureFlag: "discovery" },
  { id: "csv", label: "Upload CSV file", desc: "Import an existing prospect list in bulk", icon: FileSpreadsheet, color: "text-emerald-600 bg-emerald-50" },
];

const SOURCE_LABEL: Record<SourceId, string> = {
  "linkedin-search": "LinkedIn Search",
  "linkedin-post": "LinkedIn Post",
  "verified-emails": "Verified Emails",
  manual: "Manual Entry",
  buy: "Buy Leads",
  csv: "CSV Upload",
};

type ManualLead = { id: string; name: string; title: string; url: string };
// Full manual entry row (the "Add Leads Manually" source) — phone/companySize/
// seniority/twitter/address are real user-supplied CRM fields (unlike Buy
// Leads, this source genuinely has this data because the person typing it in knows it).
type ManualEntry = {
  id: string; name: string; email: string; company: string; title: string;
  phone: string; phoneCountry: CountryCode; companySize: string; seniority: string; twitter: string; linkedin: string;
  streetAddress: string; city: string; state: string; country: string; postalCode: string;
};

export type CsvRow = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  industry: string | null;
  interest_area: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  company_size: string | null;
  annual_revenue: string | null;
  twitter_handle: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  linkedin: string | null;
  website_url: string | null;
  _valid: boolean;
  _reason?: string;
};

const CSV_HEADER_MAP: Record<string, keyof CsvRow> = {
  full_name: "full_name", fullname: "full_name", "full name": "full_name", name: "full_name",
  company_name: "company_name", companyname: "company_name", "company name": "company_name", company: "company_name",
  email: "email", "email address": "email",
  phone: "phone", "phone number": "phone",
  industry: "industry",
  interest_area: "interest_area", interestarea: "interest_area", "interest area": "interest_area", interest: "interest_area",
  job_title: "job_title", jobtitle: "job_title", "job title": "job_title", title: "job_title",
  seniority: "seniority", "seniority level": "seniority",
  department: "department",
  company_size: "company_size", companysize: "company_size", "company size": "company_size", headcount: "company_size",
  annual_revenue: "annual_revenue", annualrevenue: "annual_revenue", "annual revenue": "annual_revenue", revenue: "annual_revenue",
  twitter: "twitter_handle", twitter_handle: "twitter_handle", "twitter handle": "twitter_handle", "twitter/x": "twitter_handle", x: "twitter_handle",
  street_address: "street_address", address: "street_address", "street address": "street_address",
  city: "city",
  state: "state", province: "state",
  country: "country",
  postal_code: "postal_code", zip: "postal_code", "zip code": "postal_code", "postal code": "postal_code",
  linkedin: "linkedin", "linkedin url": "linkedin",
  website_url: "website_url", weburl: "website_url", "web url": "website_url", website: "website_url", url: "website_url",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => CSV_HEADER_MAP[h.toLowerCase().trim()] ?? null);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: CsvRow = {
      full_name: null, email: null, phone: null, company_name: null, industry: null, interest_area: null,
      job_title: null, seniority: null, department: null, company_size: null, annual_revenue: null,
      twitter_handle: null, street_address: null, city: null, state: null, country: null, postal_code: null,
      linkedin: null, website_url: null, _valid: false,
    };
    cells.forEach((v, c) => {
      const key = headers[c];
      if (key && v) (row as Record<string, string | null | boolean>)[key] = v;
    });
    const hasIdentity = !!(row.full_name || row.company_name);
    const hasContact = !!(row.email || row.website_url);
    row._valid = hasIdentity && hasContact;
    if (!row._valid) row._reason = !hasIdentity ? "Missing name/company" : "Missing email/website";
    rows.push(row);
  }
  return rows;
}

let _mid = 0;
const newManual = (): ManualLead => ({ id: `m${++_mid}`, name: "", title: "", url: "" });

type CompanyEntry = { id: string; name: string; website: string; websiteEdited: boolean };
const newCompanyEntry = (): CompanyEntry => ({ id: `c${++_mid}`, name: "", website: "", websiteEdited: false });
/** company.com from "Company Name, Inc." — a starting suggestion only; the
 *  user can always overwrite it, tracked via websiteEdited so we never
 *  clobber a manual correction when the name changes afterward. */
function suggestWebsite(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  return slug ? `${slug}.com` : "";
}
const manualInvalidCount = (rows: ManualLead[]) => rows.filter((m) => !m.url.trim() && (m.name.trim() || m.title.trim())).length;

const newEntry = (): ManualEntry => ({
  id: `e${++_mid}`, name: "", email: "", company: "", title: "",
  phone: "", phoneCountry: "US", companySize: "", seniority: "", twitter: "", linkedin: "",
  streetAddress: "", city: "", state: "", country: "", postalCode: "",
});
// A manual entry imports if it has a name AND a LinkedIn profile — email is optional.
const entryValid = (e: ManualEntry) => !!(e.name.trim() && e.linkedin.trim()) && isPhoneValid(e.phone, e.phoneCountry);
const entryStarted = (e: ManualEntry) =>
  !!(e.name.trim() || e.email.trim() || e.company.trim() || e.title.trim() || e.phone.trim() ||
     e.companySize.trim() || e.seniority.trim() || e.twitter.trim() || e.linkedin.trim() ||
     e.streetAddress.trim() || e.city.trim() || e.state.trim() || e.country.trim() || e.postalCode.trim());
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function AddLeadsWizard({
  open,
  onClose,
  initialSource,
}: {
  open: boolean;
  onClose: () => void;
  /** Jumps straight to that source's data-entry screen (step 2) instead of the source picker — used by toolbar quick-add shortcuts. */
  initialSource?: SourceId | null;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<SourceId | null>(null);

  // Step 2 — source input
  const [inputValue, setInputValue] = useState("");
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step2Warning, setStep2Warning] = useState<string | null>(null);

  // Collected leads
  const [manual, setManual] = useState<ManualLead[]>([newManual()]);
  const [entries, setEntries] = useState<ManualEntry[]>([newEntry()]);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvName, setCsvName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Buy leads (real prospects via Bright Data, or AI samples as fallback)
  const [buy, setBuy] = useState({
    industry: "", role: "", locations: [] as string[], count: 10,
    requireVerifiedEmail: false,
  });
  const [buyResults, setBuyResults] = useState<GeneratedProspect[] | null>(null);
  const [buySource, setBuySource] = useState<"brightdata" | "anysite" | "ai" | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [bgQueueLoading, setBgQueueLoading] = useState(false);
  // Per-request cap: at most 100, further capped by what's left on the plan this cycle.
  const [maxBuyCount, setMaxBuyCount] = useState(100);

  // Buy Leads has two tabs: Individual Leads (the flow above, unchanged) and
  // Company-wise Leads — user types the company (with a website suggestion),
  // picks a location, sets a count, and finds real people at that company.
  const [buyMode, setBuyMode] = useState<"individual" | "company">("individual");
  const [companies, setCompanies] = useState<CompanyEntry[]>([newCompanyEntry()]);
  const [companyForm, setCompanyForm] = useState({
    locations: [] as string[], requireVerifiedEmail: false, count: 25,
  });
  const [companyProspects, setCompanyProspects] = useState<GeneratedProspect[] | null>(null);
  const [selectedProspects, setSelectedProspects] = useState<Set<number>>(new Set());
  const [peopleLoading, setPeopleLoading] = useState(false);

  // Import
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<{ imported: number; skipped: number; duplicates: number; leadsRemaining?: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // LinkedIn (Unipile) connection state
  const [liConnected, setLiConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Plan-gated sources (Buy Leads) — checked once when the wizard opens.
  const [locked, setLocked] = useState<{ discovery: boolean }>({ discovery: false });
  useEffect(() => {
    if (!open) return;
    hasFeature("discovery")
      .then((discovery) => setLocked({ discovery: !discovery }))
      .catch(() => {});
    getMaxBuyLeadsCount()
      .then((max) => {
        setMaxBuyCount(max);
        setBuy((b) => ({ ...b, count: Math.min(b.count, max) }));
      })
      .catch(() => {});
  }, [open]);

  const isCsv = source === "csv";
  const isLinkedIn = source === "linkedin-search" || source === "linkedin-post";
  const isManualEntry = source === "manual";
  // "verified-emails" is a shortcut into the same Buy Leads flow with the
  // verified-email filter forced on (see chooseSource) — not a separate pipeline.
  const isBuy = source === "buy" || source === "verified-emails";
  const isCompanyBuy = isBuy && buyMode === "company";

  // Check LinkedIn connection when the wizard opens / a LinkedIn source is picked
  useEffect(() => {
    if (open && isLinkedIn && liConnected === null) {
      hasLinkedInAccount().then(setLiConnected).catch(() => setLiConnected(false));
    }
  }, [open, isLinkedIn, liConnected]);

  // Toolbar quick-add shortcuts skip the source picker entirely — jump
  // straight to that source's data-entry screen (step 2) when opened this way.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time jump straight to step 2 when the wizard is opened via a toolbar quick-add shortcut */
    if (open && initialSource) {
      setSource(initialSource);
      setStep2Error(null);
      setStep2Warning(null);
      setInputValue("");
      setStep(2);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialSource]);

  useEffect(() => {
    if (open) {
      const mainEl = document.querySelector("main");
      if (mainEl) {
        const originalOverflow = mainEl.style.overflow;
        const originalOverflowY = mainEl.style.overflowY;
        const originalScrollTop = mainEl.scrollTop;
        mainEl.style.overflow = "hidden";
        mainEl.style.overflowY = "hidden";
        mainEl.scrollTop = 0;
        return () => {
          mainEl.style.overflow = originalOverflow;
          mainEl.style.overflowY = originalOverflowY;
          mainEl.scrollTop = originalScrollTop;
        };
      }
    }
  }, [open]);

  if (!open) return null;

  function handleConnectLinkedIn() {
    setConnecting(true);
    connectOutreachAccount("linkedin")
      .then((res) => { if (res.ok && res.url) window.open(res.url, "_blank", "noopener"); else setImportError(res.error || "Could not start LinkedIn connect"); })
      .finally(() => setConnecting(false));
  }
  function recheckLinkedIn() {
    setConnecting(true);
    syncOutreachAccounts()
      .then(() => hasLinkedInAccount())
      .then(setLiConnected)
      .catch(() => {})
      .finally(() => setConnecting(false));
  }

  function reset() {
    setStep(1); setSource(null); setInputValue("");
    setStep2Error(null); setStep2Warning(null);
    setManual([newManual()]); setEntries([newEntry()]); setCsvRows(null); setCsvName(""); setDragOver(false);
    setBuy({ industry: "", role: "", locations: [], count: 10, requireVerifiedEmail: false });
    setBuyResults(null); setBuySource(null); setBuyLoading(false);
    setBuyMode("individual");
    setCompanies([newCompanyEntry()]);
    setCompanyForm({ locations: [], requireVerifiedEmail: false, count: 25 });
    setCompanyProspects(null); setSelectedProspects(new Set()); setPeopleLoading(false);
    setSummary(null); setImportError(null);
  }

  function hasProgress() {
    return source !== null || inputValue.trim() !== "" || csvRows !== null ||
      manual.some((m) => m.name || m.title || m.url) ||
      entries.some(entryStarted) || buyResults !== null ||
      buy.industry !== "" || buy.role !== "" || buy.locations.length > 0 ||
      companyProspects !== null || companies.some((c) => c.name.trim());
  }

  // ---- Company-wise Leads: find people at the named companies ----
  function runFindProspects() {
    setStep2Error(null);
    setStep2Warning(null);
    setPeopleLoading(true);
    setCompanyProspects(null);
    const named = companies.filter((c) => c.name.trim());
    const websiteByName = new Map(named.map((c) => [c.name.trim().toLowerCase(), c.website.trim()]));
    const criteria: CompanyPeopleCriteria = {
      companyNames: named.map((c) => c.name.trim()),
      role: "",
      locations: companyForm.locations,
      count: companyForm.count,
      requireVerifiedEmail: companyForm.requireVerifiedEmail,
    };
    searchPeopleAtCompanies(criteria)
      .then((res) => {
        if (!res.ok) { setStep2Error(res.error || "Could not find people at these companies."); return; }
        // Carry the user-entered website through — the search only returns
        // company_name, and a real website makes Account matching at purchase
        // time much more reliable than name-only.
        const prospects = res.prospects.map((p) => {
          const website = websiteByName.get(p.company_name.trim().toLowerCase());
          return website ? { ...p, website_url: website } : p;
        });
        setCompanyProspects(prospects);
        setSelectedProspects(new Set(prospects.map((_, i) => i)));
        if (res.note) setStep2Warning(res.note);
      })
      .catch((e) => setStep2Error(e instanceof Error ? e.message : "Search failed"))
      .finally(() => setPeopleLoading(false));
  }

  async function attemptClose() {
    if (buyLoading) return; // a search is in flight — don't let it vanish mid-search
    if (summary) { reset(); onClose(); return; }       // already imported — just close
    if (hasProgress() && !(await confirm({ title: "Close this window?", message: "The details you've entered here haven't been saved yet, and will be lost.", confirmLabel: "Close anyway", danger: true }))) return;
    reset();
    onClose();
  }

  function isLocked(id: SourceId): boolean {
    const flag = SOURCES.find((s) => s.id === id)?.featureFlag;
    return flag ? locked[flag] : false;
  }

  function chooseSource(id: SourceId) {
    if (isLocked(id)) return;
    setSource(id);
    setStep2Error(null);
    setStep2Warning(null);
    setInputValue("");
    if (id === "verified-emails") {
      // Verified Emails is Individual-only and background-search-only —
      // Company-wise isn't offered here (no background support for it yet).
      setBuy((b) => ({ ...b, requireVerifiedEmail: true }));
      setBuyMode("individual");
    }
  }

  // ---- Buy leads: generate sample prospects via AI ----
  function runGenerate() {
    setStep2Error(null);
    setStep2Warning(null);
    setBuyLoading(true);
    setBuyResults(null);
    searchBuyLeads(buy)
      .then((res) => {
        if (!res.ok) { setStep2Error(res.error || "Could not find prospects."); return; }
        setBuyResults(res.prospects);
        setBuySource(res.source ?? null);
        if (res.note) setStep2Warning(res.note);
      })
      .catch((e) => setStep2Error(e instanceof Error ? e.message : "Search failed"))
      .finally(() => setBuyLoading(false));
  }

  // ---- Verified Emails: queue as a background job instead of searching now.
  // Runs across cron ticks with no time limit, emails the requester when the
  // full requested count of verified-email leads is found (or the search is
  // genuinely exhausted) — see src/lib/leads/lead-search-jobs.ts. ----
  function runInBackground() {
    setStep2Error(null);
    setStep2Warning(null);
    setBgQueueLoading(true);
    createLeadSearchJob(buy)
      .then((res) => {
        if (!res.ok) { setStep2Error(res.error || "Could not queue the search."); return; }
        const eta = res.timeEstimate ? ` Usually takes ${res.timeEstimate}, but we'll keep going as long as it takes to find all ${buy.count}.` : "";
        toast(`We'll email you when your ${buy.count} verified leads are ready.${eta} Check Verified Leads under Prospects later.`, "success");
        reset();
        onClose();
      })
      .catch((e) => setStep2Error(e instanceof Error ? e.message : "Could not queue the search."))
      .finally(() => setBgQueueLoading(false));
  }

  // ---- CSV handling ----
  function handleFile(file: File) {
    setStep2Error(null);
    if (!file.name.toLowerCase().endsWith(".csv")) { setStep2Error("Please choose a .csv file"); return; }
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setStep2Error("Failed to read file");
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.length) { setStep2Error("CSV is empty or could not be parsed"); return; }
      setCsvRows(parsed);
    };
    reader.readAsText(file);
  }

  // ---- Step 2 validation ----
  function validateStep2(): boolean {
    setStep2Error(null);
    setStep2Warning(null);
    if (isCsv) {
      if (!csvRows || csvRows.filter((r) => r._valid).length === 0) { setStep2Error("Upload a CSV with at least one valid row."); return false; }
      return true;
    }
    if (isManualEntry) {
      const started = entries.filter(entryStarted);
      if (started.length === 0) { setStep2Error("Add at least one lead with a name and a LinkedIn profile."); return false; }
      const badEmail = started.find((e) => e.email.trim() && !isEmail(e.email));
      if (badEmail) { setStep2Error(`"${badEmail.email}" isn't a valid email address.`); return false; }
      if (started.filter(entryValid).length === 0) { setStep2Error("Each lead needs a name and a LinkedIn profile."); return false; }
      return true;
    }
    if (isCompanyBuy) {
      if (!companyProspects || selectedProspects.size === 0) { setStep2Error("Find prospects and select at least one."); return false; }
      return true;
    }
    if (isBuy) {
      if (!buyResults || buyResults.length === 0) { setStep2Error("Generate a prospect list first."); return false; }
      return true;
    }
    const v = inputValue.trim();
    if (source === "linkedin-search") {
      if (!v) { setStep2Error("Paste a LinkedIn search URL to continue."); return false; }
      if (!/linkedin\.com/i.test(v)) { setStep2Error("That doesn't look like a LinkedIn URL."); return false; }
    }
    if (source === "linkedin-post") {
      if (!v) { setStep2Error("Paste the LinkedIn post URL."); return false; }
      if (!/linkedin\.com/i.test(v)) { setStep2Error("Enter a valid LinkedIn post URL."); return false; }
    }
    return true;
  }

  function next() {
    if (step === 1 && !source) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(4, s + 1));
  }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  // ---- Build payload + import (step 3 -> 4) ----
  const csvValid = csvRows?.filter((r) => r._valid) ?? [];
  const csvInvalid = csvRows?.filter((r) => !r._valid) ?? [];
  // A social lead needs a profile link — that's its only contact, and the DB
  // requires email/website/linkedin. Rows with text but no link are skipped.
  const manualValid = manual.filter((m) => m.url.trim());
  const manualInvalid = manual.filter((m) => !m.url.trim() && (m.name.trim() || m.title.trim()));
  const entryValidRows = entries.filter(entryValid);
  const entryInvalid = entries.filter((e) => entryStarted(e) && !entryValid(e));
  const reviewCount = isCsv ? csvValid.length
    : isManualEntry ? entryValidRows.length
    : isCompanyBuy ? selectedProspects.size
    : isBuy ? (buyResults?.length ?? 0)
    : manualValid.length;

  function runImport() {
    setImportError(null);

    // LinkedIn sources pull real profiles via Unipile, then import them.
    if (isLinkedIn && (source === "linkedin-search" || source === "linkedin-post")) {
      start(async () => {
        const res = await importLinkedInLeads({ source, url: inputValue.trim() });
        if (res.needsConnect) { setLiConnected(false); setImportError(res.error || "Connect your LinkedIn account first."); return; }
        if (!res.ok) { setImportError(res.error || "LinkedIn import failed"); return; }
        setSummary({ imported: res.inserted, duplicates: res.duplicates, skipped: Math.max(0, res.found - res.inserted - res.duplicates) });
        setStep(4);
        router.refresh();
      });
      return;
    }

    // Company-wise Leads has its own purchase flow (Account match-or-create per
    // company, then bulk insert) — fully separate from the generic payload path below.
    if (isCompanyBuy) {
      start(async () => {
        const chosen = (companyProspects ?? []).filter((_, i) => selectedProspects.has(i));
        const res = await purchaseCompanyWiseLeads(chosen);
        if (!res.ok) { setImportError(res.error || "Purchase failed"); return; }
        setSummary({ imported: res.inserted, skipped: 0, duplicates: res.duplicates, leadsRemaining: res.leadsRemaining });
        notifyCreditsChanged();
        setStep(4);
        router.refresh();
      });
      return;
    }

    // Buy Leads / Verified Emails — shared with the Verified Leads jobs results
    // page (background search), so the credit-check + insert + deduct logic
    // lives in one place: importGeneratedProspects().
    if (isBuy) {
      start(async () => {
        const res = await importGeneratedProspects(buyResults ?? [], buySource);
        if (!res.ok) { setImportError(res.error || "Import failed"); return; }
        setSummary({ imported: res.inserted, skipped: 0, duplicates: res.duplicates, leadsRemaining: res.leadsRemaining });
        if (res.inserted > 0) notifyCreditsChanged();
        setStep(4);
        router.refresh();
      });
      return;
    }

    const sourceLabel = source ? SOURCE_LABEL[source] : "Import";
    let payload: Array<Partial<LeadRow>>;
    let skipped: number;

    if (isCsv) {
      skipped = csvInvalid.length;
      payload = csvValid.map((r) => ({
        full_name: r.full_name, email: r.email,
        // CSV phone text has no country column of its own — detectCountry falls
        // back to "US" for anything without a leading "+", same as a manual
        // entry with no country picked. Not perfect for non-US local-format
        // numbers, but far better than storing the raw unformatted CSV text.
        phone: r.phone?.trim() ? formatPhoneForStorage(r.phone, detectCountry(r.phone)) : null,
        company_name: r.company_name, industry: r.industry, interest_area: r.interest_area,
        job_title: r.job_title, seniority: r.seniority, department: r.department,
        company_size: r.company_size, annual_revenue: r.annual_revenue, twitter_handle: r.twitter_handle,
        street_address: r.street_address, city: r.city, state: r.state, country: r.country, postal_code: r.postal_code,
        linkedin: r.linkedin, website_url: r.website_url, source: "CSV Upload", status: "New",
      }));
    } else if (isManualEntry) {
      skipped = entryInvalid.length;
      payload = entryValidRows.map((e) => ({
        full_name: e.name.trim() || null,
        email: e.email.trim() || null,
        phone: e.phone.trim() ? formatPhoneForStorage(e.phone, e.phoneCountry) : null,
        company_name: e.company.trim() || null,
        interest_area: e.title.trim() || null,
        job_title: e.title.trim() || null,
        seniority: e.seniority.trim() || null,
        company_size: e.companySize.trim() || null,
        twitter_handle: e.twitter.trim() || null,
        linkedin: e.linkedin.trim() || null,
        street_address: e.streetAddress.trim() || null,
        city: e.city.trim() || null,
        state: e.state.trim() || null,
        country: e.country.trim() || null,
        postal_code: e.postalCode.trim() || null,
        source: "Manual Entry", status: "New",
      }));
    } else {
      // Non-LinkedIn social sources (YouTube/Instagram/Twitter) — manual entry.
      skipped = manualInvalid.length;
      payload = manualValid.map((m) => ({
        full_name: m.name.trim() || null,
        message: m.title.trim() || null,
        website_url: m.url.trim() || null,
        source: sourceLabel,
        status: "New",
      }));
    }

    start(async () => {
      const res = await bulkInsertLeads(payload, { defaultSource: sourceLabel });
      if (res.error) { setImportError(res.error); return; }

      const leadsRemaining: number | undefined = undefined;

      setSummary({ imported: res.inserted, skipped, duplicates: res.duplicates, leadsRemaining });
      setStep(4);
      router.refresh();
    });
  }

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header + progress */}
      <div className="px-6 sm:px-10 py-5 border-b border-slate-100 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-2xl text-slate-900">Create a list of prospects below</h2>
            <p className="text-base text-slate-500 mt-1">Step {step} of 4 · {step === 1 ? "Choose a source" : step === 2 ? SOURCE_LABEL[source!] : step === 3 ? "Review" : "Summary"}</p>
          </div>
          <button
            onClick={attemptClose}
            aria-label="Close"
            disabled={buyLoading}
            title={buyLoading ? "Please wait for the search to finish" : undefined}
            className="text-slate-400 hover:text-slate-700 rounded-md p-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="max-w-6xl mx-auto mt-4 flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 px-6 sm:px-10 py-8 flex flex-col">
        <div className={cn(
          "max-w-6xl mx-auto w-full flex-1 flex flex-col",
          (source === "linkedin-search" || source === "linkedin-post") && step === 2 && "justify-center"
        )}>
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                const active = source === s.id;
                const sourceLocked = isLocked(s.id);

                const card = (
                  <button
                    onClick={() => chooseSource(s.id)}
                    className={`relative w-full h-full text-left rounded-[11px] p-6 transition-all ${
                      sourceLocked
                        ? "border-2 border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed"
                        : active ? "bg-blue-50 dark:bg-blue-500/15 shadow-md" : "border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {active && !sourceLocked && (
                      <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </span>
                    )}
                    {sourceLocked ? (
                      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide bg-slate-400 text-white rounded-full px-2 py-0.5">Upgrade</span>
                    ) : !active && s.badge && (
                      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide bg-blue-600 text-white rounded-full px-2 py-0.5">{s.badge}</span>
                    )}
                    <div className={`h-12 w-12 rounded-lg flex items-center justify-center mb-4 ${s.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-900 text-base">{s.label}</p>
                    <p className="text-sm text-slate-500 mt-1.5">{sourceLocked ? "Not included on your plan — upgrade to unlock." : s.desc}</p>
                  </button>
                );

                // Selected card gets the original blue → indigo gradient border frame
                if (active && !sourceLocked) {
                  return (
                    <div key={s.id} className="rounded-xl p-[3px]" style={{ background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)" }}>
                      {card}
                    </div>
                  );
                }
                return <div key={s.id}>{card}</div>;
              })}
            </div>
          )}

          {step === 2 && (
            isManualEntry ? (
              <ManualEntryForm entries={entries} setEntries={setEntries} error={step2Error} />
            ) : isBuy ? (
              <div className="space-y-6">
                {source === "buy" && (
                  <Tabs
                    tabs={[
                      { id: "individual", label: "Individual Leads", icon: <User className="h-4 w-4" /> },
                      { id: "company", label: "Company-wise Leads", icon: <Building2 className="h-4 w-4" /> },
                    ]}
                    active={buyMode}
                    onChange={(id) => { setBuyMode(id as "individual" | "company"); setStep2Error(null); }}
                  />
                )}
                {/* Verified Emails is Individual-only, background-search-only — see
                    runInBackground() and BuyForm's onRunInBackground handling. */}
                {source === "verified-emails" || buyMode === "individual" ? (
                  <BuyForm
                    buy={buy}
                    setBuy={(b) => { setBuy(b); setBuyResults(null); setBuySource(null); }}
                    source={buySource}
                    results={buyResults}
                    loading={buyLoading}
                    onGenerate={runGenerate}
                    error={step2Error}
                    warning={step2Warning}
                    maxCount={maxBuyCount}
                    onRunInBackground={source === "verified-emails" ? runInBackground : undefined}
                    backgroundLoading={bgQueueLoading}
                  />
                ) : (
                  <CompanyWiseLeadsFlow
                    companies={companies}
                    setCompanies={setCompanies}
                    form={companyForm}
                    setForm={setCompanyForm}
                    prospects={companyProspects}
                    peopleLoading={peopleLoading}
                    onFindProspects={runFindProspects}
                    selectedProspects={selectedProspects}
                    setSelectedProspects={setSelectedProspects}
                    maxCount={maxBuyCount}
                    error={step2Error}
                    warning={step2Warning}
                    clearError={() => setStep2Error(null)}
                  />
                )}
              </div>
            ) : (
              <Step2Input
                source={source!}
                inputValue={inputValue}
                setInputValue={(v) => { setInputValue(v); setStep2Error(null); }}
                error={step2Error}
                warning={step2Warning}
                csvRows={csvRows}
                csvName={csvName}
                dragOver={dragOver}
                setDragOver={setDragOver}
                fileRef={fileRef}
                onFile={handleFile}
                clearCsv={() => { setCsvRows(null); setCsvName(""); }}
              />
            )
          )}

          {step === 3 && (
            isCsv ? (
              <CsvReview rows={csvRows ?? []} valid={csvValid.length} invalid={csvInvalid.length} />
            ) : isLinkedIn ? (
              <LinkedInReview
                source={source as "linkedin-search" | "linkedin-post"}
                url={inputValue}
                connected={liConnected}
                connecting={connecting}
                onConnect={handleConnectLinkedIn}
                onRecheck={recheckLinkedIn}
              />
            ) : isManualEntry ? (
              <ManualEntryReview valid={entryValidRows.length} invalid={entryInvalid.length} rows={entries.filter(entryStarted)} />
            ) : isCompanyBuy ? (
              <CompanyBuyReview
                prospects={(companyProspects ?? []).filter((_, i) => selectedProspects.has(i))}
                companyCount={companies.filter((c) => c.name.trim()).length}
                maxCount={maxBuyCount}
              />
            ) : isBuy ? (
              <BuyReview prospects={buyResults ?? []} criteria={buy} />
            ) : (
              <ManualReview source={source!} manual={manual} setManual={setManual} />
            )
          )}

          {step === 4 && summary && (
            <div className="text-center py-6">
              <div className="h-14 w-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{isBuy ? "Leads purchased successfully" : "Import complete"}</h3>
              <p className="text-sm text-slate-500 mt-1">
                {isBuy
                  ? `${summary.imported} lead${summary.imported === 1 ? "" : "s"} added${summary.leadsRemaining != null ? ` — ${summary.leadsRemaining.toLocaleString()} remaining this cycle` : ""}.`
                  : "Your leads have been added to the workspace."}
              </p>
              <div className="grid grid-cols-3 gap-3 mt-6 max-w-md mx-auto">
                <div className="p-3 bg-emerald-50 rounded-lg"><p className="text-2xl font-bold text-emerald-700">{summary.imported}</p><p className="text-xs text-emerald-600 mt-1">Imported</p></div>
                <div className="p-3 bg-amber-50 rounded-lg"><p className="text-2xl font-bold text-amber-700">{summary.duplicates}</p><p className="text-xs text-amber-600 mt-1">Duplicates</p></div>
                <div className="p-3 bg-slate-100 rounded-lg"><p className="text-2xl font-bold text-slate-700">{summary.skipped}</p><p className="text-xs text-slate-500 mt-1">Skipped</p></div>
              </div>
            </div>
          )}

          {importError && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{importError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="px-6 sm:px-10 py-4 border-t border-slate-100 flex-shrink-0 flex items-center justify-between max-w-6xl mx-auto w-full">
          {step > 1 && step < 4 ? (
            <Button
              variant="custom"
              size="md"
              onClick={back}
              disabled={pending || buyLoading}
              className="border border-red-200 text-red-600 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          ) : <span />}

          {step < 3 && (
            <Button onClick={next} disabled={step === 1 ? !source : false}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            isLinkedIn ? (
              <Button onClick={runImport} disabled={pending || !liConnected || !inputValue.trim()}>
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching from LinkedIn…</> : <>Fetch &amp; import</>}
              </Button>
            ) : (
              <Button onClick={runImport} disabled={pending || reviewCount === 0}>
                {pending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {isCompanyBuy ? "Purchasing…" : "Importing…"}</>
                  : isCompanyBuy
                    ? <>Buy {reviewCount} Selected Lead{reviewCount === 1 ? "" : "s"}</>
                    : <>Import {reviewCount} lead{reviewCount === 1 ? "" : "s"}</>}
              </Button>
            )
          )}
          {step === 4 && (
            <Button onClick={() => { reset(); onClose(); }}>Done</Button>
          )}
      </div>
    </div>
  );
}

// ============================================================================
function Step2Input(props: {
  source: SourceId;
  inputValue: string;
  setInputValue: (v: string) => void;
  error: string | null;
  warning: string | null;
  csvRows: CsvRow[] | null;
  csvName: string;
  dragOver: boolean;
  setDragOver: (b: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  clearCsv: () => void;
}) {
  const { source, inputValue, setInputValue, error, warning, csvRows, csvName, dragOver, setDragOver, fileRef, onFile, clearCsv } = props;

  const fieldLabel: Record<SourceId, string> = {
    "linkedin-search": "LinkedIn search URL",
    "linkedin-post": "LinkedIn post URL",
    "verified-emails": "",
    manual: "",
    buy: "",
    csv: "",
  };
  const placeholder: Record<SourceId, string> = {
    "linkedin-search": "https://www.linkedin.com/search/results/people/?keywords=…",
    "linkedin-post": "https://www.linkedin.com/posts/…",
    "verified-emails": "",
    manual: "",
    buy: "",
    csv: "",
  };

  if (source === "csv") {
    return (
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        {!csvRows ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-500/15" : "border-slate-300 bg-slate-50"}`}
            >
              <div className="h-12 w-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <p className="font-medium text-slate-900 mb-1">Drag &amp; drop a CSV here</p>
              <p className="text-sm text-slate-500 mb-4">or pick a file from your computer</p>
              <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">Columns we recognise</p>
              <p><code className="text-xs">full_name</code>/<code className="text-xs">company_name</code> and <code className="text-xs">email</code>/<code className="text-xs">website_url</code> are required. Optional: <code className="text-xs">job_title</code>, <code className="text-xs">seniority</code>, <code className="text-xs">department</code>, <code className="text-xs">phone</code>, <code className="text-xs">industry</code>, <code className="text-xs">company_size</code>, <code className="text-xs">annual_revenue</code>, <code className="text-xs">twitter</code>, <code className="text-xs">street_address</code>, <code className="text-xs">city</code>, <code className="text-xs">state</code>, <code className="text-xs">country</code>, <code className="text-xs">postal_code</code>, <code className="text-xs">linkedin</code>.</p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-slate-900 text-sm">{csvName}</p>
              <p className="text-xs text-slate-500">{csvRows.length} row{csvRows.length === 1 ? "" : "s"} parsed · {csvRows.filter((r) => r._valid).length} valid</p>
            </div>
            <button onClick={clearCsv} className="text-xs text-slate-500 hover:text-slate-700 underline">Choose different file</button>
          </div>
        )}
        {csvRows && csvRows.some((r) => !r._valid) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {csvRows.filter((r) => !r._valid).length} of {csvRows.length} row{csvRows.length === 1 ? "" : "s"} {csvRows.filter((r) => !r._valid).length === 1 ? "is" : "are"} missing a required field (a name or company, and an email or website) and won&apos;t be imported.
              Fix those rows in your CSV and choose the file again, or continue to import only the valid rows.
            </span>
          </div>
        )}
        {error && <ErrorNote text={error} />}
      </div>
    );
  }

  const steps: Record<SourceId, string[]> = {
    "linkedin-search": [
      "Open LinkedIn and run a people search with the filters you want (role, industry, location).",
      "Copy the search results URL from your browser's address bar and paste it here.",
      "On the next step you'll add the profiles you found — name, title and profile link each.",
    ],
    "linkedin-post": [
      "Find a LinkedIn post with comments/reactions from people you'd like to reach.",
      "Copy the post's URL and paste it here.",
      "Next, add the engagers you want to capture as leads.",
    ],
    "verified-emails": [],
    manual: [], buy: [], csv: [],
  };

  const showHowItWorks = true;

  return (
    <div className="max-w-3xl mx-auto space-y-6 w-full">
      <div>
        <label className="block text-base font-semibold text-slate-800 mb-2">{fieldLabel[source]}</label>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder[source]}
          className="!bg-white h-12 text-base border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
        />
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-slate-400" />
        <span>
          Automated retrieval for {SOURCE_LABEL[source]} runs after you connect the channel. For now, enter the source above and add the
          profiles you found in the next step — name, title and profile link are captured to your list.
        </span>
      </div>

      {error && <ErrorNote text={error} />}
      {warning && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{warning}</span>
        </div>
      )}

      {showHowItWorks && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5">
          <p className="font-semibold text-slate-900 text-sm mb-3">How this works</p>
          <ol className="space-y-3">
            {steps[source].map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Labeled block field — label above the input, matching standard CRM form conventions. */
// Salesforce-style row used by the manual-entry form — matches the
// account/contact creation forms (right-aligned label, red required bar).
function EntryRow({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[120px_1fr] items-center gap-3", className)}>
      <label className="text-sm font-semibold text-slate-700 text-right whitespace-nowrap truncate" title={label}>{label}</label>
      <div className="relative flex items-center w-full">
        {required && <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-md z-10" />}
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{text}</span>
    </div>
  );
}

function CsvReview({ rows, valid, invalid }: { rows: CsvRow[]; valid: number; invalid: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="p-3 bg-emerald-50 rounded-lg"><p className="text-2xl font-bold text-emerald-700">{valid}</p><p className="text-xs text-emerald-600 mt-1">Valid rows</p></div>
        <div className="p-3 bg-red-50 rounded-lg"><p className="text-2xl font-bold text-red-700">{invalid}</p><p className="text-xs text-red-600 mt-1">Will be skipped</p></div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">Email</th><th className="px-3 py-2 text-left font-semibold">Company</th><th className="px-3 py-2 text-left font-semibold">Job Title</th><th className="px-3 py-2 text-left font-semibold">Phone</th><th className="px-3 py-2 text-left font-semibold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 15).map((r, i) => (
              <tr key={i} className={r._valid ? "" : "bg-red-50/50"}>
                <td className="px-3 py-2">{r.full_name || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{r.email || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{r.company_name || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{r.job_title || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{r.phone || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{r._valid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="inline-flex items-center gap-1 text-red-600 text-xs"><AlertCircle className="h-3.5 w-3.5" /> {r._reason}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 15 && <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">Showing first 15 of {rows.length} rows</p>}
      </div>
    </div>
  );
}

function ManualReview({ source, manual, setManual }: { source: SourceId; manual: ManualLead[]; setManual: (m: ManualLead[]) => void }) {
  const titleLabel = "Title / role";
  const urlLabel = source === "linkedin-search" || source === "linkedin-post" ? "Profile URL" : "Profile link";

  function update(id: string, key: keyof ManualLead, value: string) {
    setManual(manual.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  }
  function add() { setManual([...manual, newManual()]); }
  function remove(id: string) { setManual(manual.length === 1 ? [newManual()] : manual.filter((m) => m.id !== id)); }

  const validCount = manual.filter((m) => m.url.trim()).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Add the profiles you found from <span className="font-medium text-slate-900">{SOURCE_LABEL[source]}</span>. Each row needs a <span className="font-medium text-slate-900">profile link</span> to import.</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap"><Users2 className="h-3.5 w-3.5" /> {validCount} ready</span>
      </div>
      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 px-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
          <span>Name</span><span>{titleLabel}</span><span>{urlLabel} *</span><span></span>
        </div>
        {manual.map((m) => {
          const missingLink = !m.url.trim() && (m.name.trim() || m.title.trim());
          return (
            <div key={m.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
              <Input value={m.name} onChange={(e) => update(m.id, "name", e.target.value)} placeholder="Jane Doe" />
              <Input value={m.title} onChange={(e) => update(m.id, "title", e.target.value)} placeholder={titleLabel} />
              <Input
                value={m.url}
                onChange={(e) => update(m.id, "url", e.target.value)}
                placeholder="https://…"
                className={missingLink ? "border-amber-300 focus:ring-amber-200" : ""}
              />
              <button onClick={() => remove(m.id)} aria-label="Remove row" className="justify-self-start sm:justify-self-center p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add another</Button>
      {manualInvalidCount(manual) > 0 && (
        <p className="text-xs text-amber-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> {manualInvalidCount(manual)} row{manualInvalidCount(manual) === 1 ? "" : "s"} without a link will be skipped.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Add Leads Manually — full-detail entry rows
function ManualEntryForm({ entries, setEntries, error }: { entries: ManualEntry[]; setEntries: (e: ManualEntry[]) => void; error: string | null }) {
  const [companySizeBuckets, setCompanySizeBuckets] = useState(FALLBACK_COMPANY_SIZE_BUCKETS);
  const [seniorityLevels, setSeniorityLevels] = useState(FALLBACK_SENIORITY_LEVELS);
  useEffect(() => {
    getPicklistValues("lead_company_size").then(setCompanySizeBuckets).catch(() => {});
    getPicklistValues("lead_seniority").then(setSeniorityLevels).catch(() => {});
  }, []);

  function update(id: string, key: keyof ManualEntry, value: string) {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
  }
  function add() { setEntries([...entries, newEntry()]); }
  function remove(id: string) { setEntries(entries.length === 1 ? [newEntry()] : entries.filter((e) => e.id !== id)); }

  const ready = entries.filter(entryValid).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base text-slate-600">Type your leads below. Each needs a <span className="font-semibold text-slate-900">name</span> and a <span className="font-semibold text-slate-900">LinkedIn profile</span>.</p>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap"><Users2 className="h-4 w-4" /> {ready} ready</span>
      </div>
      {error && <ErrorNote text={error} />}
      <div className="space-y-4">
        {entries.map((e, idx) => {
          const bad = entryStarted(e) && !entryValid(e);
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Lead {idx + 1}</span>
                <button onClick={() => remove(e.id)} aria-label="Remove lead" className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">Contact Information</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                    <EntryRow label="Name" required><Input value={e.name} onChange={(ev) => update(e.id, "name", ev.target.value)} placeholder="Jane Doe" className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                    <EntryRow label="Email"><Input value={e.email} onChange={(ev) => update(e.id, "email", ev.target.value)} placeholder="jane@company.com" className={cn("h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm", bad && "border-amber-300 focus:ring-amber-200")} /></EntryRow>
                    <EntryRow label="Phone" className="lg:col-span-2">
                      <PhoneInput
                        label=""
                        country={e.phoneCountry}
                        value={e.phone}
                        onCountryChange={(c) => update(e.id, "phoneCountry", c)}
                        onValueChange={(v) => update(e.id, "phone", v)}
                        inputClassName="flex-1 h-11 text-base rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                      />
                    </EntryRow>
                    <EntryRow label="LinkedIn" required><Input value={e.linkedin} onChange={(ev) => update(e.id, "linkedin", ev.target.value)} placeholder="linkedin.com/in/janedoe" leftIcon={<Link2 className="h-4 w-4" />} className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                    <EntryRow label="Twitter / X"><Input value={e.twitter} onChange={(ev) => update(e.id, "twitter", ev.target.value)} placeholder="@janedoe" className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">Company Information</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                    <EntryRow label="Company"><Input value={e.company} onChange={(ev) => update(e.id, "company", ev.target.value)} placeholder="Acme Inc." className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                    <EntryRow label="Job title"><Input value={e.title} onChange={(ev) => update(e.id, "title", ev.target.value)} placeholder="Head of Sales" className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                    <EntryRow label="Company size">
                      <Select value={e.companySize} onChange={(ev) => update(e.id, "companySize", ev.target.value)} className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm">
                        <option value="">Select…</option>
                        {companySizeBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
                      </Select>
                    </EntryRow>
                    <EntryRow label="Seniority">
                      <Select value={e.seniority} onChange={(ev) => update(e.id, "seniority", ev.target.value)} className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm">
                        <option value="">Select…</option>
                        {seniorityLevels.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </EntryRow>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">Address</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                    <EntryRow label="Street"><Input value={e.streetAddress} onChange={(ev) => update(e.id, "streetAddress", ev.target.value)} placeholder="123 Main St" className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                    <EntryRow label="City">
                      <LocationAutocomplete
                        type="city"
                        value={e.city || ""}
                        onChange={(val) => update(e.id, "city", val)}
                        placeholder="City"
                        className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                        countryContext={e.country}
                        stateContext={e.state}
                      />
                    </EntryRow>
                    <EntryRow label="State">
                      <LocationAutocomplete
                        type="state"
                        value={e.state || ""}
                        onChange={(val) => update(e.id, "state", val)}
                        placeholder="State"
                        className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                        countryContext={e.country}
                      />
                    </EntryRow>
                    <EntryRow label="Country">
                      <LocationAutocomplete
                        type="country"
                        value={e.country || ""}
                        onChange={(val) => update(e.id, "country", val)}
                        placeholder="Country"
                        className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                      />
                    </EntryRow>
                    <EntryRow label="Postal code"><Input value={e.postalCode} onChange={(ev) => update(e.id, "postalCode", ev.target.value)} placeholder="Postal" className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" /></EntryRow>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add another</Button>
    </div>
  );
}

function ManualEntryReview({ valid, invalid, rows }: { valid: number; invalid: number; rows: ManualEntry[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="p-3 bg-emerald-50 rounded-lg"><p className="text-2xl font-bold text-emerald-700">{valid}</p><p className="text-xs text-emerald-600 mt-1">Ready to import</p></div>
        <div className="p-3 bg-red-50 rounded-lg"><p className="text-2xl font-bold text-red-700">{invalid}</p><p className="text-xs text-red-600 mt-1">Will be skipped</p></div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">Email</th><th className="px-3 py-2 text-left font-semibold">Company</th><th className="px-3 py-2 text-left font-semibold">Phone</th><th className="px-3 py-2 text-left font-semibold">Seniority</th><th className="px-3 py-2 text-left font-semibold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 15).map((e) => (
              <tr key={e.id} className={entryValid(e) ? "" : "bg-red-50/50"}>
                <td className="px-3 py-2">{e.name || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{e.email || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{e.company || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{e.phone ? formatPhoneForStorage(e.phone, e.phoneCountry) : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">{e.seniority || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">
                  {entryValid(e) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {!e.name.trim() || !e.linkedin.trim() ? "Needs name + LinkedIn" : "Invalid phone number"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 15 && <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">Showing first 15 of {rows.length}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// Buy Leads — real LinkedIn prospects via Bright Data (AI samples as fallback)
export type BuyState = {
  industry: string; role: string; locations: string[]; count: number;
  requireVerifiedEmail: boolean;
};

// Fallbacks while the workspace's actual (admin-editable, Settings > Picklists)
// values load in — "Any" is a client-only sentinel for this filter UI, never stored.
const FALLBACK_COMPANY_SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const FALLBACK_SENIORITY_LEVELS = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"];
export function BuyForm({ buy, setBuy, results, source, loading, onGenerate, error, warning, maxCount, onRunInBackground, backgroundLoading }: {
  buy: BuyState;
  setBuy: (b: BuyState) => void;
  results: GeneratedProspect[] | null;
  source: "brightdata" | "anysite" | "ai" | null;
  loading: boolean;
  onGenerate: () => void;
  error: string | null;
  warning?: string | null;
  maxCount: number;
  /** Set only for the "Verified Emails" source — when present, this form is
   *  background-search-only (no instant "Find prospects"): guaranteeing an
   *  exact count with a real email needs patience an on-screen wait can't
   *  honestly promise, so that path doesn't exist here at all. */
  onRunInBackground?: () => void;
  backgroundLoading?: boolean;
}) {
  const isReal = source === "brightdata" || source === "anysite";
  // Initialized once from buy.count — BuyForm unmounts whenever the user leaves
  // the Buy Leads source/step, so a fresh mount always picks up the latest value
  // (e.g. after the plan-cap clamp on wizard open) without needing a sync effect.
  const [countDraft, setCountDraft] = useState(String(buy.count));

  function commitCount() {
    const n = Math.max(1, Math.min(maxCount, parseInt(countDraft, 10) || 1));
    setCountDraft(String(n));
    if (n !== buy.count) setBuy({ ...buy, count: n });
  }

  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-semibold text-slate-800 mb-2">Industry</label>
            <Select value={buy.industry} onChange={(e) => setBuy({ ...buy, industry: e.target.value })} className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm">
              <option value="">Any industry</option>
              {LINKEDIN_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-base font-semibold text-slate-800 mb-2">Job title / role</label>
            <Select value={buy.role} onChange={(e) => setBuy({ ...buy, role: e.target.value })} className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm">
              <option value="">Any role</option>
              {COMMON_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-base font-semibold text-slate-800 mb-2">Location</label>
          <MultiLocationInput value={buy.locations} onChange={(v) => setBuy({ ...buy, locations: v })} />
        </div>

        <div className="max-w-[220px]">
          <label className="block text-base font-semibold text-slate-800 mb-2">How many (max {maxCount})</label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={countDraft}
            onChange={(e) => setCountDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitCount}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCount(); } }}
            className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onRunInBackground ? (
            <Button onClick={onRunInBackground} disabled={backgroundLoading} size="lg" className="shadow-md">
              {backgroundLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Queuing…</>
                : <><Sparkles className="h-4 w-4" /> Search &amp; email me when ready</>}
            </Button>
          ) : (
            <Button onClick={onGenerate} disabled={loading} size="lg" className="shadow-md">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Finding prospects…</>
                : <><Sparkles className="h-4 w-4" /> {results ? "Search again" : "Find prospects"}</>}
            </Button>
          )}
        </div>
        {onRunInBackground && (
          <p className="text-sm text-slate-500">
            Every lead here comes with a verified email — that takes real time to confirm, so this runs in the background, however long it needs. We&apos;ll email you when it&apos;s ready; find it later under Prospects → Verified Leads.
          </p>
        )}

        {results && isReal && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4" /> {results.length} real prospects found — review them on the next step.
          </div>
        )}

        {results && source === "ai" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Couldn&apos;t reach the data provider, so these are <span className="font-semibold">AI-generated samples</span> — not verified contacts.</span>
          </div>
        )}

        {warning && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{warning}</span>
          </div>
        )}
        {error && <ErrorNote text={error} />}
      </div>

      <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-5 h-fit space-y-4">
        <div>
          <p className="font-bold text-slate-900 text-base mb-3 uppercase tracking-wider">What you&apos;ll get</p>
          <ul className="space-y-3 text-base text-slate-600">
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> Name, job title, company and LinkedIn URL from real public profiles.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> An estimated seniority label, shown alongside each result (not a search filter — just informational).</li>
            {onRunInBackground ? (
              <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> A confirmed work email for every result, guaranteed — never guessed, never skipped.</li>
            ) : (
              <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> No email — this is a fast, no-email lookup. Use Verified Emails if you need one.</li>
            )}
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> Up to {maxCount} prospects per search, based on your plan.</li>
          </ul>
        </div>
        <div className="pt-3 border-t border-amber-200/70">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-1.5">Not available from this source</p>
          <p className="text-sm text-slate-600 leading-relaxed">There&apos;s no public data source for a company&apos;s exact headcount, revenue, direct phone, or Twitter/X handle, and seniority is only ever a best-effort estimate from the title text — never a real search filter. Add those yourself afterward, or via Manual Entry / CSV Import where you already have them.</p>
        </div>
      </div>
    </div>
  );
}

export function BuyReview({ prospects, criteria }: { prospects: GeneratedProspect[]; criteria: { industry: string; role: string; locations: string[] } }) {
  const withLinkedIn = prospects.filter((p) => p.linkedin).length;
  const withEmail = prospects.filter((p) => p.email).length;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
        Prospects for <span className="font-medium text-slate-900">{criteria.role || "decision makers"}</span> in <span className="font-medium text-slate-900">{criteria.industry || "any industry"}</span>{criteria.locations.length ? <> · {criteria.locations.join(", ")}</> : null}
        {prospects.length > 0 && <span className="text-slate-400"> · {withLinkedIn} with LinkedIn · {withEmail} with an email</span>}
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Title</th>
              <th className="px-3 py-2 text-left font-semibold">Seniority</th>
              <th className="px-3 py-2 text-left font-semibold">Email</th>
              <th className="px-3 py-2 text-left font-semibold">LinkedIn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {prospects.slice(0, 15).map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-2 align-top">{p.full_name || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-slate-600 align-top"><span className="line-clamp-2">{p.title || "—"}</span></td>
                <td className="px-3 py-2 text-slate-600 align-top">{p.seniority || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-slate-600 align-top">
                  {p.email ? (
                    <span className="flex items-center gap-1.5">
                      {p.email}
                      {p.emailVerificationStatus === "valid" && <Badge variant="success">Verified</Badge>}
                      {p.emailVerificationStatus === "catch_all" && <Badge variant="warning">Catch-all</Badge>}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 align-top">{p.linkedin ? <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Profile</a> : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {prospects.length > 15 && <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">Showing first 15 of {prospects.length}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// Company-wise Leads — same shape as Individual Leads, plus a Company field
// that's live-searched from the Industry/Location (never a hardcoded list).
type CompanyWiseForm = { locations: string[]; requireVerifiedEmail: boolean; count: number };

function CompanyWiseLeadsFlow({
  companies, setCompanies, form, setForm, prospects, peopleLoading, onFindProspects,
  selectedProspects, setSelectedProspects, maxCount, error, warning, clearError,
}: {
  companies: CompanyEntry[];
  setCompanies: (c: CompanyEntry[]) => void;
  form: CompanyWiseForm;
  setForm: (f: CompanyWiseForm) => void;
  prospects: GeneratedProspect[] | null;
  peopleLoading: boolean;
  onFindProspects: () => void;
  selectedProspects: Set<number>;
  setSelectedProspects: (s: Set<number>) => void;
  maxCount: number;
  error: string | null;
  warning?: string | null;
  clearError: () => void;
}) {
  const [countDraft, setCountDraft] = useState(String(form.count));
  const [showResults, setShowResults] = useState(prospects !== null);

  function updateCompany(id: string, patch: Partial<CompanyEntry>) {
    setCompanies(companies.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch };
      // Only auto-fill the website from the name if the user hasn't manually
      // edited it themselves — a manual correction is never overwritten.
      if ("name" in patch && !c.websiteEdited) next.website = suggestWebsite(next.name);
      return next;
    }));
  }
  function updateWebsite(id: string, website: string) {
    setCompanies(companies.map((c) => (c.id === id ? { ...c, website, websiteEdited: true } : c)));
  }
  function addCompany() { setCompanies([...companies, newCompanyEntry()]); }
  function removeCompany(id: string) { setCompanies(companies.length === 1 ? [newCompanyEntry()] : companies.filter((c) => c.id !== id)); }

  function toggleProspect(i: number) {
    const next = new Set(selectedProspects);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelectedProspects(next);
  }
  function toggleAllProspects() {
    if (!prospects) return;
    setSelectedProspects(selectedProspects.size === prospects.length ? new Set() : new Set(prospects.map((_, i) => i)));
  }
  function commitCount() {
    const n = Math.max(1, Math.min(maxCount, parseInt(countDraft, 10) || 1));
    setCountDraft(String(n));
    if (n !== form.count) setForm({ ...form, count: n });
  }

  const namedCount = companies.filter((c) => c.name.trim()).length;

  if (showResults) {
    return (
      <div className="space-y-4">
        {peopleLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding people at {companies.filter((c) => c.name.trim()).map((c) => c.name).join(", ")}…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-600">
                {prospects?.length ?? 0} prospects found. <span className="font-medium text-slate-900">{selectedProspects.size} selected</span>.
              </p>
              <button onClick={() => setShowResults(false)} className="text-xs text-blue-600 hover:underline">Adjust search</button>
            </div>
            <CompanyProspectsTable prospects={prospects ?? []} selected={selectedProspects} onToggle={toggleProspect} onToggleAll={toggleAllProspects} />
            {error && <ErrorNote text={error} />}
            {!error && (prospects?.length ?? 0) === 0 && (
              <div className="text-center py-6 text-sm text-slate-500">No prospects found at these companies. Go back and check the company names, or broaden the location/count.</div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
      <div className="space-y-4">
        <div>
          <label className="block text-base font-semibold text-slate-800 mb-2">Company</label>
          <div className="space-y-3">
            {companies.map((c) => (
              <div key={c.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => updateCompany(c.id, { name: e.target.value })}
                  placeholder="e.g. Microsoft"
                  leftIcon={<Building2 className="h-4 w-4" />}
                  className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                />
                <Input
                  value={c.website}
                  onChange={(e) => updateWebsite(c.id, e.target.value)}
                  placeholder="company website, e.g. microsoft.com"
                  className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                />
                <button
                  onClick={() => removeCompany(c.id)}
                  aria-label="Remove company"
                  className="justify-self-start sm:justify-self-center p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addCompany} className="mt-2"><Plus className="h-4 w-4" /> Add another company</Button>
          <p className="text-xs text-slate-400 mt-1.5">The website is suggested from the company name — fix it if it&apos;s wrong.</p>
        </div>

        <div>
          <label className="block text-base font-semibold text-slate-800 mb-2">Location</label>
          <MultiLocationInput value={form.locations} onChange={(v) => setForm({ ...form, locations: v })} />
        </div>

        <div className="max-w-[220px]">
          <label className="block text-base font-semibold text-slate-800 mb-2">How many leads (max {maxCount})</label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={countDraft}
            onChange={(e) => setCountDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitCount}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCount(); } }}
            className="h-11 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
          />
        </div>

        <Button
          onClick={() => { clearError(); onFindProspects(); setShowResults(true); }}
          disabled={peopleLoading || namedCount === 0}
          size="lg"
          className="shadow-md"
        >
          {peopleLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Finding prospects…</> : <><Sparkles className="h-4 w-4" /> Find Prospects</>}
        </Button>

        {namedCount === 0 && <p className="text-xs text-slate-400">Enter at least one company to continue.</p>}
        {warning && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{warning}</span>
          </div>
        )}
        {error && <ErrorNote text={error} />}
      </div>

      <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-5 h-fit space-y-4">
        <div>
          <p className="font-bold text-slate-900 text-base mb-3 uppercase tracking-wider">What you&apos;ll get</p>
          <ul className="space-y-3 text-base text-slate-600">
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> Real people working at the company(ies) you enter, from real public profiles.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> Each lead is linked to that company&apos;s Account record automatically.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" /> Work email included when found — flagged as verified or catch-all, never guessed silently.</li>
          </ul>
        </div>
        <div className="pt-3 border-t border-amber-200/70">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-1.5">Not available from this source</p>
          <p className="text-sm text-slate-600 leading-relaxed">Company revenue and exact headcount aren&apos;t reliably available for every company.</p>
        </div>
      </div>
    </div>
  );
}

function CompanyProspectsTable({ prospects, selected, onToggle, onToggleAll, readOnly }: {
  prospects: GeneratedProspect[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onToggleAll: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === prospects.length && prospects.length > 0} onChange={onToggleAll} disabled={readOnly} className="rounded border-slate-400" /></th>
            <th className="px-3 py-2 text-left font-semibold">Name</th>
            <th className="px-3 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold">Company</th>
            <th className="px-3 py-2 text-left font-semibold">Seniority</th>
            <th className="px-3 py-2 text-left font-semibold">Email</th>
            <th className="px-3 py-2 text-left font-semibold">LinkedIn</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prospects.slice(0, 30).map((p, i) => (
            <tr key={i} className={!selected.has(i) ? "opacity-50" : ""}>
              <td className="px-3 py-2"><input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} disabled={readOnly} className="rounded border-slate-400" /></td>
              <td className="px-3 py-2 align-top">{p.full_name || <span className="text-slate-400">—</span>}</td>
              <td className="px-3 py-2 text-slate-600 align-top"><span className="line-clamp-2">{p.title || "—"}</span></td>
              <td className="px-3 py-2 text-slate-600 align-top">{p.company_name || <span className="text-slate-400">—</span>}</td>
              <td className="px-3 py-2 text-slate-600 align-top">{p.seniority || <span className="text-slate-400">—</span>}</td>
              <td className="px-3 py-2 text-slate-600 align-top">
                {p.email ? (
                  <span className="flex items-center gap-1.5">
                    {p.email}
                    {p.emailVerificationStatus === "valid" && <Badge variant="success">Verified</Badge>}
                    {p.emailVerificationStatus === "catch_all" && <Badge variant="warning">Catch-all</Badge>}
                  </span>
                ) : <span className="text-slate-400">Not available</span>}
              </td>
              <td className="px-3 py-2 align-top">{p.linkedin ? <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Profile</a> : <span className="text-slate-400">Not available</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {prospects.length > 30 && <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">Showing first 30 of {prospects.length}</p>}
    </div>
  );
}

function CompanyBuyReview({ prospects, companyCount, maxCount }: { prospects: GeneratedProspect[]; companyCount: number; maxCount: number }) {
  const companies = [...new Set(prospects.map((p) => p.company_name).filter(Boolean))];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div><p className="text-2xl font-bold text-slate-900">{prospects.length}</p><p className="text-xs text-slate-500 mt-1">Selected</p></div>
        <div><p className="text-2xl font-bold text-slate-900">{companies.length}</p><p className="text-xs text-slate-500 mt-1">Companies (from {companyCount} selected)</p></div>
        <div><p className="text-2xl font-bold text-slate-900">{prospects.length}</p><p className="text-xs text-slate-500 mt-1">Credits required</p></div>
        <div><p className="text-2xl font-bold text-slate-900">{maxCount.toLocaleString()}</p><p className="text-xs text-slate-500 mt-1">Remaining this cycle</p></div>
      </div>
      <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3 text-sm text-slate-600">
        Source: <span className="font-medium text-slate-900">Company-wise Leads</span>. Each person will be linked to their Account/Company, and preserves the search criteria used to find them.
      </div>
      <CompanyProspectsTable prospects={prospects} selected={new Set(prospects.map((_, i) => i))} onToggle={() => {}} onToggleAll={() => {}} readOnly />
    </div>
  );
}

function LinkedInReview({ source, url, connected, connecting, onConnect, onRecheck }: {
  source: "linkedin-search" | "linkedin-post";
  url: string;
  connected: boolean | null;
  connecting: boolean;
  onConnect: () => void;
  onRecheck: () => void;
}) {
  const label = source === "linkedin-post" ? "post engagers" : "search results";

  if (connected === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your LinkedIn connection…
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="rounded-xl border border-slate-200 p-6 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
          <Link2 className="h-6 w-6" />
        </div>
        <p className="font-semibold text-slate-900">Connect your LinkedIn account</p>
        <p className="text-sm text-slate-500 mt-1 mb-4 max-w-md mx-auto">
          We pull {label} on your behalf through your own LinkedIn session (via Unipile). Connect once, then come back and import.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={onConnect} disabled={connecting}>
            {connecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening…</> : <><ExternalLink className="h-4 w-4" /> Connect LinkedIn</>}
          </Button>
          <Button variant="outline" onClick={onRecheck} disabled={connecting}>
            <RefreshCw className="h-4 w-4" /> I&apos;ve connected
          </Button>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Uses your real LinkedIn account · daily limits apply to stay safe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <CheckCircle2 className="h-4 w-4" /> LinkedIn connected — ready to import.
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-600">We&apos;ll pull up to <span className="font-medium text-slate-900">50</span> {label} from:</p>
        <p className="text-sm text-blue-700 break-all mt-1">{url}</p>
        <p className="text-xs text-slate-400 mt-3">Click <span className="font-medium">Fetch &amp; import</span> below. Larger pulls run in batches and respect LinkedIn limits.</p>
      </div>
    </div>
  );
}
