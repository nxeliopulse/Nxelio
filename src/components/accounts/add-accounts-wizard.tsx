"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { bulkInsertAccounts, type AccountRow } from "@/lib/queries/accounts";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn } from "@/lib/utils";
import { formatPhoneForStorage, detectCountry } from "@/components/ui/phone-input";

type AccountCsvRow = {
  account_name: string | null;
  website: string | null;
  domain: string | null;
  phone: string | null;
  industry: string | null;
  account_type: string | null;
  employees: string | null;
  annual_revenue: string | null;
  rating: string | null;
  ownership: string | null;
  account_status: string | null;
  _valid: boolean;
  _reason?: string;
};

/**
 * Maps common header spellings (lowercased, trimmed) to the canonical field
 * they represent — modeled directly on add-leads-wizard.tsx's CSV_HEADER_MAP.
 */
const CSV_HEADER_MAP: Record<string, keyof AccountCsvRow> = {
  account_name: "account_name", accountname: "account_name", "account name": "account_name",
  company: "account_name", "company name": "account_name", companyname: "account_name", name: "account_name",

  website: "website", "website url": "website", weburl: "website", "web url": "website", url: "website", site: "website",

  domain: "domain",

  phone: "phone", "phone number": "phone", telephone: "phone", "telephone number": "phone",

  industry: "industry",

  account_type: "account_type", accounttype: "account_type", "account type": "account_type", type: "account_type",

  employees: "employees", "employee count": "employees", employeecount: "employees", headcount: "employees",
  "no of employees": "employees", "number of employees": "employees", "company size": "employees", companysize: "employees",

  annual_revenue: "annual_revenue", annualrevenue: "annual_revenue", "annual revenue": "annual_revenue", revenue: "annual_revenue",

  rating: "rating",

  ownership: "ownership",

  account_status: "account_status", accountstatus: "account_status", "account status": "account_status", status: "account_status",
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

function parseCsv(text: string): AccountCsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => CSV_HEADER_MAP[h.toLowerCase().trim()] ?? null);
  const rows: AccountCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: AccountCsvRow = {
      account_name: null, website: null, domain: null, phone: null, industry: null,
      account_type: null, employees: null, annual_revenue: null, rating: null,
      ownership: null, account_status: null, _valid: false,
    };
    cells.forEach((v, c) => {
      const key = headers[c];
      if (key && v) (row as Record<string, string | null | boolean>)[key] = v;
    });
    row._valid = !!row.account_name?.trim();
    if (!row._valid) row._reason = "Missing account name";
    rows.push(row);
  }
  return rows;
}

/** Strips everything but digits/decimal point so "$5,000,000" or "1,000 employees" parse to a plain number. */
function parseNumeric(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const PREVIEW_LIMIT = 100;

export function AddAccountsWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const { collapsed } = useSidebar();

  const [rows, setRows] = useState<AccountCsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setRows(null);
    setFileName("");
    setParseError(null);
    setDragOver(false);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setParseError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) { setParseError("Please choose a .csv file"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setParseError("Failed to read file");
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.length) { setParseError("CSV is empty or could not be parsed"); return; }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  const validRows = rows?.filter((r) => r._valid) ?? [];
  const invalidRows = rows?.filter((r) => !r._valid) ?? [];

  function runImport() {
    if (!validRows.length) return;
    const payload: Array<Partial<AccountRow>> = validRows.map((r) => ({
      account_name: (r.account_name || "").trim(),
      website: r.website?.trim() || null,
      domain: r.domain?.trim() || null,
      // CSV text has no country column — format it the same best-effort way as
      // manual entry with no country picked. Previously this stored the raw
      // CSV text verbatim, which then hard-failed the server's strict
      // (country-less) isValidPhoneNumber check for any number without a
      // leading "+", rejecting perfectly normal local-format spreadsheet data.
      phone: r.phone?.trim() ? formatPhoneForStorage(r.phone, detectCountry(r.phone)) : null,
      industry: r.industry?.trim() || null,
      account_type: r.account_type?.trim() || null,
      employees: parseNumeric(r.employees),
      annual_revenue: parseNumeric(r.annual_revenue),
      rating: r.rating?.trim() || null,
      ownership: r.ownership?.trim() || null,
      account_status: r.account_status?.trim() || null,
    }));
    const invalidCount = invalidRows.length;

    start(async () => {
      const res = await bulkInsertAccounts(payload);
      if (res.error) {
        toast(`Import failed: ${res.error}`, "error");
        return;
      }
      const parts = [`${res.inserted} account${res.inserted === 1 ? "" : "s"} imported`];
      if (res.duplicates > 0) parts.push(`${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"} skipped`);
      if (invalidCount > 0) parts.push(`${invalidCount} invalid row${invalidCount === 1 ? "" : "s"} skipped`);
      toast(parts.join(", ") + ".", res.inserted > 0 ? "success" : "info");
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "fixed top-16 bottom-0 right-0 z-20 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden text-slate-900 dark:text-white transition-all duration-300 ease-in-out",
        collapsed ? "left-0 lg:left-[84px]" : "left-0 lg:left-[210px]"
      )}
    >
      {/* Header */}
      <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 mb-0.5">Accounts &gt; Import from CSV</p>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Import Accounts</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">Upload a CSV file to add multiple accounts at once.</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            disabled={pending}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-700 p-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 p-6 sm:p-8 bg-white dark:bg-slate-900 w-full">
        <div className="max-w-4xl mx-auto space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />

          {!rows ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                className={cn(
                  "border-2 border-dashed rounded-xl p-16 text-center transition-colors",
                  dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-500/15" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40"
                )}
              >
                <div className="h-12 w-12 mx-auto rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mb-3">
                  <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-medium text-slate-900 dark:text-white mb-1">Drag &amp; drop a CSV here</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">or pick a file from your computer</p>
                <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-900/40 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-400">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">Columns we recognize</p>
                <p>
                  <code className="text-xs">account_name</code> (or <code className="text-xs">company</code>) is required. Optional:{" "}
                  <code className="text-xs">website</code>, <code className="text-xs">domain</code>, <code className="text-xs">phone</code>,{" "}
                  <code className="text-xs">industry</code>, <code className="text-xs">account_type</code>, <code className="text-xs">employees</code>,{" "}
                  <code className="text-xs">annual_revenue</code>, <code className="text-xs">rating</code>, <code className="text-xs">ownership</code>,{" "}
                  <code className="text-xs">account_status</code>.
                </p>
              </div>

              {parseError && <ErrorNote text={parseError} />}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-lg border border-slate-200 dark:border-slate-800">
                <FileSpreadsheet className="h-8 w-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{fileName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">{rows.length} row{rows.length === 1 ? "" : "s"} parsed</p>
                </div>
                <button onClick={reset} disabled={pending} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline flex-shrink-0 disabled:opacity-40">
                  Choose different file
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{validRows.length}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Valid rows found</p>
                </Card>
                <Card className="p-3 bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/40">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{invalidRows.length}</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">Will be skipped</p>
                </Card>
              </div>

              {invalidRows.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} {invalidRows.length === 1 ? "is" : "are"} missing an account name and won&apos;t be imported.
                    Fix those rows in your CSV and choose the file again, or continue to import only the valid rows.
                  </span>
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-xs uppercase text-slate-500 dark:text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Account Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Website</th>
                        <th className="px-3 py-2 text-left font-semibold">Phone</th>
                        <th className="px-3 py-2 text-left font-semibold">Industry</th>
                        <th className="px-3 py-2 text-left font-semibold">Type</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                        <tr key={i} className={r._valid ? "" : "bg-red-50/50 dark:bg-red-950/10"}>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-300">{r.account_name || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-300">{r.website || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-300">{r.phone || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-300">{r.industry || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-300">{r.account_type || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2">
                            {r._valid ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs"><AlertCircle className="h-3.5 w-3.5" /> {r._reason}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > PREVIEW_LIMIT && (
                  <p className="text-xs text-slate-500 dark:text-slate-500 px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800">
                    Showing first {PREVIEW_LIMIT} of {rows.length} rows
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 flex items-center justify-between bg-white dark:bg-slate-900">
        <Button variant="outline" size="sm" onClick={handleClose} disabled={pending} className="h-8 text-xs px-4">Cancel</Button>
        <Button size="sm" onClick={runImport} disabled={pending || validRows.length === 0} className="h-8 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white">
          {pending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <>Import {validRows.length} account{validRows.length === 1 ? "" : "s"}</>}
        </Button>
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{text}</span>
    </div>
  );
}
