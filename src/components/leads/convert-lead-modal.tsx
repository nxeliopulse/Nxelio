"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, Loader2, Building2, User as UserIcon, X, ArrowLeft, Plus, Sparkles, Mail, Phone, ShieldCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useFeedback } from "@/components/ui/feedback";
import { getConversionMatches, convertLead } from "@/lib/queries/lead-conversion";
import type { AccountRow } from "@/lib/queries/accounts";
import type { ContactRow } from "@/lib/queries/contacts";
import { OPPORTUNITY_STAGES, STAGE_LABELS, type OpportunityStage } from "@/lib/opportunities";
import type { LeadRow } from "@/lib/queries/leads";
import { cn } from "@/lib/utils";

function splitName(fullName: string | null): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

/** Numbered section header — matches the step-1/2/3 layout of the design. */
function StepHeader({ n, title, description, right }: { n: number; title: string; description: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-5 rounded-full bg-[#18A7B8] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <div>
          <p className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500">{description}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

/** A selectable "use existing X" / "create new X" card, radio-style. */
function ChoiceCard({ selected, onClick, icon, title, subtitle, subtitleColor = "text-slate-500" }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; subtitleColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border-2 p-2 text-left transition-colors",
        selected ? "border-[#18A7B8] bg-[#18A7B8]/5" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
      )}
    >
      <span className={cn("h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center", selected ? "border-[#18A7B8]" : "border-slate-300")}>
        {selected && <span className="h-2 w-2 rounded-full bg-[#18A7B8]" />}
      </span>
      <span className={cn("h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0", selected ? "bg-[#18A7B8]/15 text-[#18A7B8]" : "bg-slate-100 dark:bg-[var(--muted)] text-slate-500")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-900 dark:text-white leading-snug">{title}</span>
        <span className={cn("block text-xs truncate", subtitleColor)}>{subtitle}</span>
      </span>
    </button>
  );
}

export function ConvertLeadModal({
  open, onClose, lead, onConverted,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadRow;
  onConverted: (result: { accountId: string; contactId: string; opportunityId: string | null }) => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matchedAccount, setMatchedAccount] = useState<AccountRow | null>(null);
  const [matchedContact, setMatchedContact] = useState<ContactRow | null>(null);

  const [accountMode, setAccountMode] = useState<"existing" | "new">("new");
  const [accountName, setAccountName] = useState(lead.company_name || "");
  const [accountWebsite, setAccountWebsite] = useState(lead.website_url || "");
  const [accountIndustry, setAccountIndustry] = useState(lead.industry || "");

  const [contactMode, setContactMode] = useState<"existing" | "new">("new");
  const { first: defaultFirst, last: defaultLast } = splitName(lead.full_name);
  const [contactFirstName, setContactFirstName] = useState(defaultFirst);
  const [contactLastName, setContactLastName] = useState(defaultLast || "—");
  const [contactEmail, setContactEmail] = useState(lead.email || "");
  const [contactPhone, setContactPhone] = useState(lead.phone || "");

  const [createOpportunity, setCreateOpportunity] = useState(true);
  const [oppName, setOppName] = useState("");
  const [oppStage, setOppStage] = useState<OpportunityStage>("qualified");
  const [oppAmount, setOppAmount] = useState("");
  const [oppCloseDate, setOppCloseDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init when the modal opens for this lead
    setLoadingMatches(true);
    getConversionMatches(lead.id)
      .then(({ account, contact }) => {
        setMatchedAccount(account);
        setMatchedContact(contact);
        setAccountMode(account ? "existing" : "new");
        setContactMode(contact ? "existing" : "new");
      })
      .finally(() => setLoadingMatches(false));

    const in30 = new Date(Date.now() + 30 * 86400000);
    setOppCloseDate(in30.toISOString().slice(0, 10));
  }, [open, lead.id]);

  const effectiveAccountName = accountMode === "existing" ? matchedAccount?.account_name || "" : accountName;
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the default deal name when the account choice changes
    setOppName(effectiveAccountName ? `${effectiveAccountName} - New Deal` : "New Deal");
  }, [effectiveAccountName, open]);

  async function handleConvert() {
    setSaving(true);
    try {
      const result = await convertLead({
        leadId: lead.id,
        account:
          accountMode === "existing" && matchedAccount
            ? { mode: "existing", id: matchedAccount.id }
            : { mode: "new", payload: { account_name: accountName.trim() || "Untitled Account", website: accountWebsite.trim() || null, industry: accountIndustry.trim() || null } },
        contact:
          contactMode === "existing" && matchedContact
            ? { mode: "existing", id: matchedContact.id }
            : { mode: "new", payload: { first_name: contactFirstName.trim() || "Unknown", last_name: contactLastName.trim() || "—", email: contactEmail.trim() || null, phone: contactPhone.trim() || null } },
        opportunity: createOpportunity
          ? { name: oppName.trim() || "New Deal", stage: oppStage, dealValue: parseFloat(oppAmount) || 0, expectedCloseDate: oppCloseDate || null }
          : null,
      });
      toast("Prospect converted.", "success");
      onConverted(result);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Conversion failed. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-[var(--muted)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "text-[11px] font-medium text-slate-600 dark:text-slate-500 block mb-0.5";
  const effectiveContactName = contactMode === "existing" && matchedContact ? `${matchedContact.first_name} ${matchedContact.last_name}` : `${contactFirstName} ${contactLastName}`.trim();
  const effectiveContactEmail = contactMode === "existing" && matchedContact ? matchedContact.email : contactEmail;
  const effectiveContactPhone = contactMode === "existing" && matchedContact ? matchedContact.phone : contactPhone;

  if (!open) return null;

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
      {/* Header */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} aria-label="Back" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-700 rounded-md p-1">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="font-semibold text-base text-slate-900 dark:text-white leading-tight">
                Convert Prospect: <span className="text-[#18A7B8]">{lead.full_name || lead.company_name || "Prospect"}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-500">Create or link an Account, Contact, and optional Opportunity</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-700 rounded-md p-1">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-3.5 flex-1">
        {loadingMatches ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for existing matches…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4 items-start">
            {/* Main column */}
            <div className="space-y-3 min-w-0">
              {/* 1. Account */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <StepHeader n={1} title="Account" description="Choose an existing account or create a new one" />
                <div className={cn("grid gap-2", matchedAccount ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                  {matchedAccount && (
                    <ChoiceCard
                      selected={accountMode === "existing"}
                      onClick={() => setAccountMode("existing")}
                      icon={<Building2 className="h-4 w-4" />}
                      title="Use existing Account"
                      subtitle={matchedAccount.account_name}
                      subtitleColor="text-[#18A7B8] font-medium"
                    />
                  )}
                  <ChoiceCard
                    selected={accountMode === "new"}
                    onClick={() => setAccountMode("new")}
                    icon={<Plus className="h-4 w-4" />}
                    title="Create new Account"
                    subtitle="Add a new account"
                  />
                </div>
                {accountMode === "new" && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <label className={label}>Account name</label>
                      <input className={field} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Website</label>
                      <input className={field} value={accountWebsite} onChange={(e) => setAccountWebsite(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Industry</label>
                      <input className={field} value={accountIndustry} onChange={(e) => setAccountIndustry(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Contact */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <StepHeader
                  n={2}
                  title="Contact"
                  description={matchedContact ? "Choose an existing contact or create a new one" : "Create a new contact for this conversion"}
                />
                {matchedContact && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <ChoiceCard
                      selected={contactMode === "existing"}
                      onClick={() => setContactMode("existing")}
                      icon={<UserIcon className="h-4 w-4" />}
                      title="Use existing Contact"
                      subtitle={`${matchedContact.first_name} ${matchedContact.last_name}`}
                      subtitleColor="text-[#18A7B8] font-medium"
                    />
                    <ChoiceCard
                      selected={contactMode === "new"}
                      onClick={() => setContactMode("new")}
                      icon={<Plus className="h-4 w-4" />}
                      title="Create new Contact"
                      subtitle="Add a new contact"
                    />
                  </div>
                )}
                {contactMode === "new" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className={label}>First name</label>
                      <input className={field} value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Last name</label>
                      <input className={field} value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Email</label>
                      <input className={field} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Phone</label>
                      <input className={field} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Opportunity */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <StepHeader
                  n={3}
                  title="Opportunity (optional)"
                  description="Create an opportunity related to this prospect"
                  right={<Switch checked={createOpportunity} onChange={setCreateOpportunity} aria-label="Create opportunity" />}
                />
                {createOpportunity && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="col-span-2 sm:col-span-2">
                      <label className={label}>Name</label>
                      <input className={field} value={oppName} onChange={(e) => setOppName(e.target.value)} />
                    </div>
                    <div>
                      <label className={label}>Stage</label>
                      <select className={field} value={oppStage} onChange={(e) => setOppStage(e.target.value as OpportunityStage)}>
                        {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Amount ($)</label>
                      <input type="number" min="0" placeholder="0" className={field} value={oppAmount} onChange={(e) => setOppAmount(e.target.value)} />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <label className={label}>Close date</label>
                      <input type="date" className={field} value={oppCloseDate} onChange={(e) => setOppCloseDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Conversion Summary sidebar */}
            <div className="rounded-xl border border-teal-100 bg-teal-50/40 dark:border-teal-900/30 dark:bg-teal-950/20 p-3 space-y-2 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                <Sparkles className="h-3.5 w-3.5 text-[#18A7B8]" /> Conversion Summary
              </p>

              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <UserIcon className="h-3 w-3" /> Prospect
                </p>
                <p className="text-xs text-slate-800 dark:text-slate-700 pl-4 font-medium">{lead.full_name || lead.company_name || "—"}</p>
              </div>

              <div className="border-t border-teal-100 dark:border-teal-900/30" />

              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <Building2 className="h-3 w-3" /> Account
                </p>
                <p className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-700 pl-4 font-medium">
                  <span className="truncate">{effectiveAccountName || "—"}</span>
                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.2 rounded-full flex-shrink-0", accountMode === "existing" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                    {accountMode === "existing" ? "Existing" : "New"}
                  </span>
                </p>
              </div>

              <div className="border-t border-teal-100 dark:border-teal-900/30" />

              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <UserIcon className="h-3 w-3" /> Contact
                </p>
                <p className="text-xs text-slate-800 dark:text-slate-700 pl-4 font-medium">{effectiveContactName || "—"}</p>
                {effectiveContactEmail && (
                  <p className="flex items-center gap-1 text-[11px] text-slate-500 pl-4"><Mail className="h-3 w-3" /> {effectiveContactEmail}</p>
                )}
                {effectiveContactPhone && (
                  <p className="flex items-center gap-1 text-[11px] text-slate-500 pl-4"><Phone className="h-3 w-3" /> {effectiveContactPhone}</p>
                )}
              </div>

              {createOpportunity && (
                <>
                  <div className="border-t border-teal-100 dark:border-teal-900/30" />
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      <Briefcase className="h-3 w-3" /> Opportunity
                    </p>
                    <p className="text-xs text-slate-800 dark:text-slate-700 pl-4 font-medium">{oppName || "—"}</p>
                    <p className="text-[11px] text-slate-500 pl-4">Stage: {STAGE_LABELS[oppStage]}</p>
                    <p className="text-[11px] text-slate-500 pl-4">Amount: ${oppAmount || "0"}</p>
                    {oppCloseDate && (
                      <p className="flex items-center gap-1 text-[11px] text-slate-500 pl-4"><CalendarClock className="h-3 w-3" /> Close: {oppCloseDate}</p>
                    )}
                  </div>
                </>
              )}

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 p-2 flex items-start gap-1.5 text-[11px] text-blue-800 dark:text-blue-200">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
                <span>Review details before converting.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleConvert} disabled={saving || loadingMatches}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />} Complete Conversion
        </Button>
      </div>
    </div>
  );
}
