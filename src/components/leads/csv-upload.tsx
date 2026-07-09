"use client";
import { useRef, useState, useTransition } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkInsertLeads } from "@/lib/queries/leads";

type ParsedRow = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  industry: string | null;
  interest_area: string | null;
  linkedin: string | null;
  website_url: string | null;
  _valid: boolean;
  _reason?: string;
};

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  "full_name": "full_name",
  "fullname": "full_name",
  "full name": "full_name",
  "name": "full_name",
  "company_name": "company_name",
  "companyname": "company_name",
  "company name": "company_name",
  "company": "company_name",
  "email": "email",
  "email address": "email",
  "phone": "phone",
  "phone number": "phone",
  "industry": "industry",
  "interest_area": "interest_area",
  "interestarea": "interest_area",
  "interest area": "interest_area",
  "interest": "interest_area",
  "linkedin": "linkedin",
  "linkedin url": "linkedin",
  "website_url": "website_url",
  "weburl": "website_url",
  "web url": "website_url",
  "website": "website_url",
  "url": "website_url",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { rows: ParsedRow[]; rawHeaders: string[] } {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], rawHeaders: [] };

  const rawHeaders = splitCsvLine(lines[0]);
  const fieldKeys: (keyof ParsedRow | null)[] = rawHeaders.map((h) => {
    const key = h.toLowerCase().trim();
    return HEADER_MAP[key] ?? null;
  });

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: ParsedRow = {
      full_name: null,
      email: null,
      phone: null,
      company_name: null,
      industry: null,
      interest_area: null,
      linkedin: null,
      website_url: null,
      _valid: false,
    };
    for (let c = 0; c < cells.length; c++) {
      const key = fieldKeys[c];
      if (!key) continue;
      const v = cells[c]?.trim();
      if (v) (row as Record<string, string | null | boolean>)[key] = v;
    }
    const hasIdentity = !!(row.full_name || row.company_name);
    const hasContact = !!(row.email || row.website_url);
    row._valid = hasIdentity && hasContact;
    if (!row._valid) {
      row._reason = !hasIdentity
        ? "Missing name/company"
        : "Missing email/website";
    }
    rows.push(row);
  }
  return { rows, rawHeaders };
}

export function CsvUpload({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePick() {
    fileInputRef.current?.click();
  }

  function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    setFileName(file.name);
    setFileSize(file.size);
    const reader = new FileReader();
    reader.onerror = () => setError("Failed to read file");
    reader.onload = () => {
      const text = String(reader.result || "");
      const { rows: parsed } = parseCsv(text);
      if (parsed.length === 0) {
        setError("CSV is empty or could not be parsed");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  const validRows = rows?.filter((r) => r._valid) ?? [];
  const invalidRows = rows?.filter((r) => !r._valid) ?? [];

  function handleImport() {
    if (!validRows.length) return;
    setError(null);
    setSuccess(null);
    start(async () => {
      const payload = validRows.map((r) => ({
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        company_name: r.company_name,
        industry: r.industry,
        interest_area: r.interest_area,
        linkedin: r.linkedin,
        website_url: r.website_url,
      }));
      const res = await bulkInsertLeads(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(`Imported ${res.inserted} lead${res.inserted === 1 ? "" : "s"}`);
      setTimeout(() => onClose(), 900);
    });
  }

  return (
    <div>
      <div className="p-5 space-y-5">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{success}</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {!rows && (
          <>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-slate-50">
              <div className="h-12 w-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <p className="font-medium text-slate-900 mb-1">Choose a CSV file</p>
              <p className="text-sm text-slate-500 mb-4">Headers in the first row</p>
              <Button onClick={handlePick}>Choose file</Button>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="font-semibold text-slate-900 text-sm mb-2">Required CSV columns:</p>
              <ul className="text-sm text-slate-700 space-y-1.5">
                <li className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">full_name</span> or
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">company_name</span> required
                </li>
                <li className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">email</span> or
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">website_url</span> required
                </li>
                <li className="flex items-center gap-2 flex-wrap text-slate-500">
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">industry</span>,
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">interest_area</span>,
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">linkedin</span>,
                  <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">phone</span> optional
                </li>
              </ul>
            </div>
          </>
        )}

        {rows && (
          <>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-slate-900 text-sm">{fileName}</p>
                <p className="text-xs text-slate-500">
                  {rows.length} row{rows.length === 1 ? "" : "s"} · {Math.max(1, Math.round(fileSize / 1024))} KB
                </p>
              </div>
              <button
                onClick={() => {
                  setRows(null);
                  setFileName("");
                  setFileSize(0);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Choose different file
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                <p className="text-xs text-emerald-600 mt-1">Valid rows</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">{invalidRows.length}</p>
                <p className="text-xs text-red-600 mt-1">Invalid rows</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Email</th>
                    <th className="px-3 py-2 text-left font-semibold">Company</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className={r._valid ? "" : "bg-red-50/50"}>
                      <td className="px-3 py-2">{r.full_name || <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">{r.email || <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">{r.company_name || <span className="text-slate-400">—</span>}</td>
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
              {rows.length > 5 && (
                <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">
                  Showing first 5 of {rows.length} rows
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        {rows && (
          <Button onClick={handleImport} disabled={pending || validRows.length === 0}>
            {pending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
            ) : (
              <>Import {validRows.length} lead{validRows.length === 1 ? "" : "s"}</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
