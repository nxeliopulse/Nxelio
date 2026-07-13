"use client";
import { useEffect, useState } from "react";
import { Loader2, Mail, AlertCircle } from "lucide-react";
import { getEmailProviderStatuses, findLeadEmail, type EmailProviderStatus } from "@/lib/leads/find-email";

const PROVIDER_META: Record<EmailProviderStatus["id"], { label: string; color: string }> = {
  anysite: { label: "AnySite", color: "bg-indigo-50 text-indigo-700" },
  findymail: { label: "Findymail", color: "bg-emerald-50 text-emerald-700" },
  apollo: { label: "Apollo", color: "bg-purple-50 text-purple-700" },
  hunter: { label: "Hunter", color: "bg-orange-50 text-orange-700" },
};

/** Inline provider grid (AnySite / Findymail / Apollo / Hunter) for finding a lead's email. */
export function FindEmailPicker({
  leadId,
  linkedinUrl,
  onFound,
}: {
  leadId: string;
  linkedinUrl: string | null;
  onFound: (email: string) => void;
}) {
  const [providers, setProviders] = useState<EmailProviderStatus[] | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEmailProviderStatuses().then(setProviders);
  }, []);

  async function pick(p: EmailProviderStatus) {
    if (!p.configured || loadingId) return;
    setError(null);
    setLoadingId(p.id);
    const res = await findLeadEmail(leadId, p.id, linkedinUrl);
    setLoadingId(null);
    if (res.ok && res.email) onFound(res.email);
    else setError(res.error || "Couldn't find an email.");
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600 mb-2">Find a verified email using:</p>
      {!providers ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {providers.map((p) => {
            const meta = PROVIDER_META[p.id];
            const disabled = !p.configured || loadingId !== null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                disabled={disabled}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  p.configured ? `${meta.color} border-transparent hover:opacity-80` : "bg-white text-slate-400 border-slate-200 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {loadingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  {meta.label}
                </span>
                {!p.configured && <span className="text-[10px] text-slate-400">Needs API key</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />{error}</p>
      )}
    </div>
  );
}
