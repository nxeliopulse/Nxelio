"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn } from "@/lib/utils";
import { bulkInsertContacts } from "@/lib/queries/contacts-import";
import type { ContactRow } from "@/lib/queries/contacts";
import { formatPhoneForStorage, detectCountry } from "@/components/ui/phone-input";

// CSV-specific parsing, adapted from add-leads-wizard.tsx (splitCsvLine /
// parseCsv / CSV_HEADER_MAP / CsvRow pattern) for the Contacts field set.
type CsvRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  job_title: string | null;
  department: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_country: string | null;
  mailing_zip: string | null;
  linkedin: string | null;
  twitter: string | null;
  _valid: boolean;
  _reason?: string;
};

// Maps common CSV header variants (lowercased) to our canonical field keys.
const CSV_HEADER_MAP: Record<string, keyof CsvRow> = {
  first_name: "first_name", firstname: "first_name", "first name": "first_name", "given name": "first_name", first: "first_name",
  last_name: "last_name", lastname: "last_name", "last name": "last_name", "family name": "last_name", surname: "last_name", last: "last_name",
  email: "email", "email address": "email", "e-mail": "email", emailaddress: "email",
  phone: "phone", "phone number": "phone", telephone: "phone", "work phone": "phone", "contact number": "phone",
  mobile: "mobile", "mobile number": "mobile", cell: "mobile", "cell phone": "mobile", cellphone: "mobile",
  job_title: "job_title", jobtitle: "job_title", "job title": "job_title", title: "job_title", position: "job_title", role: "job_title",
  department: "department", dept: "department",
  mailing_street: "mailing_street", street: "mailing_street", "street address": "mailing_street", address: "mailing_street", "mailing address": "mailing_street",
  mailing_city: "mailing_city", city: "mailing_city",
  mailing_state: "mailing_state", state: "mailing_state", province: "mailing_state", region: "mailing_state",
  mailing_country: "mailing_country", country: "mailing_country",
  mailing_zip: "mailing_zip", zip: "mailing_zip", "zip code": "mailing_zip", postal_code: "mailing_zip", "postal code": "mailing_zip", postcode: "mailing_zip",
  linkedin: "linkedin", "linkedin url": "linkedin", "linkedin profile": "linkedin",
  twitter: "twitter", "twitter handle": "twitter", "twitter/x": "twitter", x: "twitter",
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

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => CSV_HEADER_MAP[h.toLowerCase().trim()] ?? null);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: CsvRow = {
      first_name: null, last_name: null, email: null, phone: null, mobile: null,
      job_title: null, department: null, mailing_street: null, mailing_city: null,
      mailing_state: null, mailing_country: null, mailing_zip: null, linkedin: null, twitter: null,
      _valid: false,
    };
    cells.forEach((v, c) => {
      const key = headers[c];
      if (key && v) (row as Record<string, string | null | boolean>)[key] = v;
    });
    // Identity: needs a first or last name. Contact info: needs an email or phone.
    const hasIdentity = !!(row.first_name || row.last_name);
    const hasContact = !!(row.email || row.phone);
    row._valid = hasIdentity && hasContact;
    if (!row._valid) row._reason = !hasIdentity ? "Missing first/last name" : "Missing email/phone";
    rows.push(row);
  }
  return rows;
}

const PREVIEW_LIMIT = 50;

export function AddContactsWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const { collapsed } = useSidebar();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  function reset() {
    setRows(null);
    setFileName("");
    setDragOver(false);
    setParseError(null);
    setImporting(false);
  }

  function handleClose() {
    if (importing) return; // an import is in flight — don't let it vanish mid-import
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setParseError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a .csv file");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setParseError("Failed to read file");
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.length) {
        setParseError("CSV is empty or could not be parsed");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  function clearFile() {
    setRows(null);
    setFileName("");
    setParseError(null);
  }

  const validRows = rows?.filter((r) => r._valid) ?? [];
  const invalidRows = rows?.filter((r) => !r._valid) ?? [];

  async function runImport() {
    if (!validRows.length) return;
    setImporting(true);
    try {
      const payload: Array<Partial<ContactRow>> = validRows.map((r) => ({
        first_name: r.first_name ?? "",
        last_name: r.last_name ?? "",
        email: r.email,
        // Same best-effort formatting as manual entry with no country picked —
        // CSV text has no country column of its own to key off of.
        phone: r.phone?.trim() ? formatPhoneForStorage(r.phone, detectCountry(r.phone)) : null,
        mobile: r.mobile?.trim() ? formatPhoneForStorage(r.mobile, detectCountry(r.mobile)) : null,
        job_title: r.job_title,
        department: r.department,
        mailing_street: r.mailing_street,
        mailing_city: r.mailing_city,
        mailing_state: r.mailing_state,
        mailing_country: r.mailing_country,
        mailing_zip: r.mailing_zip,
        linkedin: r.linkedin,
        twitter: r.twitter,
      }));
      const res = await bulkInsertContacts(payload);
      if (res.error) {
        toast(`Import failed: ${res.error}`, "error");
        return;
      }
      const skipped = invalidRows.length;
      const parts = [`${res.inserted} contact${res.inserted === 1 ? "" : "s"} imported`];
      if (res.duplicates) parts.push(`${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"} skipped`);
      if (skipped) parts.push(`${skipped} invalid row${skipped === 1 ? "" : "s"} skipped`);
      toast(parts.join(", ") + ".", res.inserted > 0 ? "success" : "info");
      router.refresh();
      reset();
      onClose();
    } catch {
      toast("Couldn't import contacts. Try again.", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed top-16 bottom-0 right-0 z-20 bg-slate-100 flex flex-col overflow-hidden text-slate-900 transition-all duration-300 ease-in-out",
        collapsed ? "left-0 lg:left-[84px]" : "left-0 lg:left-[210px]"
      )}
    >
      {/* Subheader Action Bar */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Import Contacts from CSV</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={importing} className="h-7 text-xs px-3 text-slate-700">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={runImport}
            disabled={importing || validRows.length === 0}
            className="h-7 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
              </>
            ) : (
              <>Import {validRows.length} contact{validRows.length === 1 ? "" : "s"}</>
            )}
          </Button>
          <button
            onClick={handleClose}
            aria-label="Close"
            disabled={importing}
            title={importing ? "Please wait for the import to finish" : undefined}
            className="text-slate-400 hover:text-slate-600 p-1 ml-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 p-6 sm:p-8 space-y-6 bg-white w-full">
        {parseError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium flex items-start gap-2 max-w-2xl">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{parseError}</span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        {!rows ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                "border-2 border-dashed rounded-xl p-16 text-center transition-colors max-w-2xl mx-auto",
                dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"
              )}
            >
              <div className="h-12 w-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <p className="font-medium text-slate-900 mb-1">Drag &amp; drop a CSV here</p>
              <p className="text-sm text-slate-500 mb-4">or pick a file from your computer</p>
              <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
            </div>
            <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">Columns we recognise</p>
              <p>
                <code className="text-xs">first_name</code>/<code className="text-xs">last_name</code> and{" "}
                <code className="text-xs">email</code>/<code className="text-xs">phone</code> are required. Optional:{" "}
                <code className="text-xs">mobile</code>, <code className="text-xs">job_title</code>, <code className="text-xs">department</code>,{" "}
                <code className="text-xs">mailing_street</code>, <code className="text-xs">mailing_city</code>, <code className="text-xs">mailing_state</code>,{" "}
                <code className="text-xs">mailing_country</code>, <code className="text-xs">mailing_zip</code>, <code className="text-xs">linkedin</code>,{" "}
                <code className="text-xs">twitter</code>.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-2xl">
              <FileSpreadsheet className="h-8 w-8 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm truncate">{fileName}</p>
                <p className="text-xs text-slate-500">{rows.length} row{rows.length === 1 ? "" : "s"} parsed</p>
              </div>
              <button onClick={clearFile} className="text-xs text-slate-500 hover:text-slate-700 underline flex-shrink-0">
                Choose different file
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div className="p-3 bg-emerald-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                <p className="text-xs text-emerald-600 mt-1">Valid rows found</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-700">{invalidRows.length}</p>
                <p className="text-xs text-red-600 mt-1">Will be skipped</p>
              </div>
            </div>

            {invalidRows.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 max-w-2xl">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {invalidRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} {invalidRows.length === 1 ? "is" : "are"} missing a required
                  field (a first or last name, and an email or phone) and won&apos;t be imported.
                </span>
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Email</th>
                      <th className="px-3 py-2 text-left font-semibold">Phone</th>
                      <th className="px-3 py-2 text-left font-semibold">Job Title</th>
                      <th className="px-3 py-2 text-left font-semibold">Country</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                      <tr key={i} className={r._valid ? "" : "bg-red-50/50"}>
                        <td className="px-3 py-2">
                          {[r.first_name, r.last_name].filter(Boolean).join(" ") || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2">{r.email || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2">{r.phone || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2">{r.job_title || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2">{r.mailing_country || <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2">
                          {r._valid ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                              <AlertCircle className="h-3.5 w-3.5" /> {r._reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_LIMIT && (
                <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">
                  Showing first {PREVIEW_LIMIT} of {rows.length} rows
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
