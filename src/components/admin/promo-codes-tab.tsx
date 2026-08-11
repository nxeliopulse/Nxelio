"use client";
import { useState, useTransition } from "react";
import { Copy, Check, Loader2, Ban, Ticket } from "lucide-react";
import {
  createEmailPromoCode, revokeEmailPromoCode, type EmailPromoCodeRow,
} from "@/lib/queries/admin-promo-codes";

const STATUS_STYLE: Record<EmailPromoCodeRow["status"], string> = {
  unused: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  redeemed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  expired: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  revoked: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

function tomorrowPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PromoCodesTab({ initialCodes }: { initialCodes: EmailPromoCodeRow[] }) {
  const [codes, setCodes] = useState(initialCodes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  const [discountValue, setDiscountValue] = useState("20");
  const [expiresAt, setExpiresAt] = useState(tomorrowPlus(30));
  const [note, setNote] = useState("");
  const [justCreatedDetails, setJustCreatedDetails] = useState<{ email: string; discountType: "percentage" | "fixed_amount"; discountValue: number; expiresAt: string; note: string } | null>(null);

  function handleCreate() {
    setError(null);
    setJustCreated(null);
    startTransition(async () => {
      const res = await createEmailPromoCode({
        email,
        discountType,
        discountValue: parseFloat(discountValue),
        expiresAt: new Date(expiresAt).toISOString(),
        note,
      });
      if (!res.ok || !res.code) { setError(res.error || "Couldn't create the code."); return; }
      setJustCreated(res.code);
      setJustCreatedDetails({ email: email.trim(), discountType, discountValue: parseFloat(discountValue), expiresAt, note: note.trim() });
      setCodes((prev) => [
        {
          id: crypto.randomUUID(), code: res.code!, restricted_email: email.trim().toLowerCase(),
          discount_type: discountType, discount_value: parseFloat(discountValue), is_active: true,
          times_redeemed: 0, max_redemptions: 1, valid_until: new Date(expiresAt).toISOString(),
          created_at: new Date().toISOString(), description: note.trim() || null, status: "unused",
        },
        ...prev,
      ]);
      setEmail(""); setNote("");
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const res = await revokeEmailPromoCode(id);
      if (res.ok) setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: false, status: "revoked" } : c)));
    });
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    });
  }

  return (
    <div className="space-y-5">
      {/* Create form */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Ticket className="h-4.5 w-4.5 text-[#18A7B8]" /> Generate a one-time promo code
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Valid for exactly one email address, exactly one use, until the expiry date you set.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prospect@company.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1">Discount type</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed_amount")}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="percentage">Percent off</option>
              <option value="fixed_amount">Dollar amount off</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1">
              {discountType === "percentage" ? "Percent (%)" : "Amount ($)"}
            </label>
            <input
              type="number"
              min={0}
              max={discountType === "percentage" ? 100 : undefined}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1">Expires on</label>
            <input
              type="date"
              value={expiresAt}
              min={tomorrowPlus(1)}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="lg:col-span-4">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 block mb-1">Note (internal only, optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Outbound follow-up for the Acme demo"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={pending || !email.trim() || !discountValue}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18A7B8] hover:bg-[#14929f] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate code"}
            </button>
          </div>
        </div>
        {error && <p className="px-5 pb-4 text-xs text-red-600">{error}</p>}
        {justCreated && justCreatedDetails && (
          <div className="mx-5 mb-5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">Code created — send this to the customer:</p>
                <p className="font-mono text-lg font-bold text-emerald-800 dark:text-emerald-300 tracking-wider">{justCreated}</p>
              </div>
              <button onClick={() => copy(justCreated)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                {copiedCode === justCreated ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedCode === justCreated ? "Copied" : "Copy"}
              </button>
            </div>
            <dl className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-500/20 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div><dt className="text-emerald-600/70 dark:text-emerald-400/70">Email</dt><dd className="font-semibold text-emerald-800 dark:text-emerald-300">{justCreatedDetails.email}</dd></div>
              <div><dt className="text-emerald-600/70 dark:text-emerald-400/70">Discount</dt><dd className="font-semibold text-emerald-800 dark:text-emerald-300">{justCreatedDetails.discountType === "percentage" ? `${justCreatedDetails.discountValue}% off` : `$${justCreatedDetails.discountValue} off`}</dd></div>
              <div><dt className="text-emerald-600/70 dark:text-emerald-400/70">Expires</dt><dd className="font-semibold text-emerald-800 dark:text-emerald-300">{new Date(justCreatedDetails.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd></div>
              {justCreatedDetails.note && <div><dt className="text-emerald-600/70 dark:text-emerald-400/70">Note</dt><dd className="font-semibold text-emerald-800 dark:text-emerald-300">{justCreatedDetails.note}</dd></div>}
            </dl>
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base">Codes issued</h3>
        </div>
        {codes.length === 0 ? (
          <p className="p-8 text-sm text-slate-400 text-center">No email-restricted codes yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {codes.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50/60 dark:hover:bg-[var(--muted)] transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-900 dark:text-white tracking-wider">{c.code}</span>
                    <button onClick={() => copy(c.code)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
                      {copiedCode === c.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    {c.restricted_email} · {c.discount_type === "percentage" ? `${c.discount_value}% off` : `$${c.discount_value} off`}
                    {c.valid_until && ` · expires ${new Date(c.valid_until).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
                  </p>
                  {c.description && <p className="text-xs text-slate-400 mt-0.5">{c.description}</p>}
                </div>
                {c.status === "unused" && (
                  <button
                    onClick={() => handleRevoke(c.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
