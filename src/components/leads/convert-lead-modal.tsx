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
import { isValidEmail, isValidWebsite, EMAIL_ERROR, WEBSITE_ERROR } from "@/lib/validation";
import { PhoneInput, detectCountry, formatPhoneForStorage, isPhoneValid, type CountryCode } from "@/components/ui/phone-input";

function splitName(fullName: string | null): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

function StepHeader({ n, title, description, right }: { n: number; title: string; description: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5">
      <div className="flex items-center gap-2">
        <span className="h-5 w-5 rounded-full bg-[#18A7B8] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <div>
          <p className="font-bold text-xs text-slate-900 dark:text-white leading-tight">{title}</p>
          <p className="text-[10px] text-slate-450">{description}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

function ChoiceCard({ selected, onClick, icon, title, subtitle, subtitleColor = "text-slate-500" }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; subtitleColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border-2 p-2.5 text-left transition-all",
        selected ? "border-[#18A7B8] bg-[#18A7B8]/5" : "border-slate-200 dark:border-slate-800 hover:border-slate-350"
      )}
    >
      <span className={cn("h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-1", selected ? "border-[#18A7B8]" : "border-slate-300")}>
        {selected && <span className="h-2 w-2 rounded-full bg-[#18A7B8]" />}
      </span>
      <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mr-1.5", selected ? "bg-[#18A7B8]/15 text-[#18A7B8]" : "bg-slate-100 dark:bg-[var(--muted)] text-slate-500 dark:text-slate-400")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-slate-900 dark:text-white leading-tight">{title}</span>
        <span className={cn("block text-[11px] truncate mt-0.5", subtitleColor)}>{subtitle}</span>
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
  const [contactPhoneCountry, setContactPhoneCountry] = useState<CountryCode>(() => detectCountry(lead.phone));

  const [createOpportunity, setCreateOpportunity] = useState(true);
  const [oppName, setOppName] = useState("");
  const [oppStage, setOppStage] = useState<OpportunityStage>("qualified");
  const [oppAmount, setOppAmount] = useState("");
  const [oppCloseDate, setOppCloseDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sets the loading flag before the async lookup below resolves
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshes the suggested deal name once the matched account resolves; oppName stays user-editable afterward
    setOppName(effectiveAccountName ? `${effectiveAccountName} - New Deal` : "New Deal");
  }, [effectiveAccountName, open]);

  async function handleConvert() {
    if (accountMode === "new" && !isValidWebsite(accountWebsite)) { toast(WEBSITE_ERROR, "error"); return; }
    if (contactMode === "new" && !isValidEmail(contactEmail)) { toast(EMAIL_ERROR, "error"); return; }
    if (contactMode === "new" && !isPhoneValid(contactPhone, contactPhoneCountry)) {
      toast("Contact phone number isn't valid for the selected country.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await convertLead({
        leadId: lead.id,
        account:
          accountMode === "existing" && matchedAccount
            ? { mode: "existing", id: matchedAccount.id }
            : {
                mode: "new",
                payload: {
                  account_name: accountName.trim() || "Untitled Account",
                  website: accountWebsite.trim() || null,
                  industry: accountIndustry.trim() || null,
                  billing_street: lead.street_address || null,
                  billing_city: lead.city || null,
                  billing_state: lead.state || null,
                  billing_country: lead.country || null,
                  billing_zip: lead.postal_code || null,
                },
              },
        contact:
          contactMode === "existing" && matchedContact
            ? { mode: "existing", id: matchedContact.id }
            : {
                mode: "new",
                payload: {
                  first_name: contactFirstName.trim() || "Unknown",
                  last_name: contactLastName.trim() || "—",
                  email: contactEmail.trim() || null,
                  phone: contactPhone.trim() ? formatPhoneForStorage(contactPhone, contactPhoneCountry) : null,
                  mailing_street: lead.street_address || null,
                  mailing_city: lead.city || null,
                  mailing_state: lead.state || null,
                  mailing_country: lead.country || null,
                  mailing_zip: lead.postal_code || null,
                },
              },
        opportunity: createOpportunity
          ? { name: oppName.trim() || "New Deal", stage: oppStage, dealValue: parseFloat(oppAmount) || 0, expectedCloseDate: oppCloseDate || null }
          : null,
      });
      toast("Prospect converted successfully.", "success");
      onConverted(result);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Conversion failed. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] transition";
  const labelStyle = "text-[10px] font-bold text-slate-500 uppercase block mb-1";
  
  const effectiveContactName = contactMode === "existing" && matchedContact ? `${matchedContact.first_name} ${matchedContact.last_name}` : `${contactFirstName} ${contactLastName}`.trim();
  const effectiveContactEmail = contactMode === "existing" && matchedContact ? matchedContact.email : contactEmail;
  const effectiveContactPhone = contactMode === "existing" && matchedContact ? matchedContact.phone : contactPhone;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="lp-anim-fade fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Centered dialog */}
      <div className="lp-anim-scale relative w-full sm:w-[960px] max-w-[95vw] max-h-[90vh] bg-white dark:bg-slate-950 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-850 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onClose} aria-label="Back" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg p-1 mr-1 transition-colors">
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                Convert Prospect: <span className="text-[#18A7B8]">{lead.full_name || lead.company_name || "Prospect"}</span>
              </h2>
              <p className="text-[10px] text-slate-450 mt-1 uppercase tracking-wider font-bold">Link or create account, contact, and opportunities</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-450 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg p-1.5 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable drawer body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5 pr-3.5">
          {loadingMatches ? (
            <div className="flex flex-col items-center gap-3 text-slate-500 py-16 justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#18A7B8]" />
              <p className="text-xs font-semibold">Checking database for matching companies/contacts…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              
              {/* Step 1: Account Selection */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                <StepHeader n={1} title="Account (Company)" description="Create a new account or link to an existing account" />
                <div className={cn("grid gap-3", matchedAccount ? "grid-cols-2" : "grid-cols-1")}>
                  {matchedAccount && (
                    <ChoiceCard
                      selected={accountMode === "existing"}
                      onClick={() => setAccountMode("existing")}
                      icon={<Building2 className="h-4 w-4" />}
                      title="Link Existing Account"
                      subtitle={matchedAccount.account_name}
                      subtitleColor="text-[#18A7B8] font-bold"
                    />
                  )}
                  <ChoiceCard
                    selected={accountMode === "new"}
                    onClick={() => setAccountMode("new")}
                    icon={<Plus className="h-4 w-4" />}
                    title="Create New Account"
                    subtitle="Create account record"
                  />
                </div>
                {accountMode === "new" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 animate-in fade-in duration-200">
                    <div>
                      <label className={labelStyle}>Account Name</label>
                      <input className={fieldStyle} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Website</label>
                      <input className={fieldStyle} value={accountWebsite} onChange={(e) => setAccountWebsite(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Industry</label>
                      <input className={fieldStyle} value={accountIndustry} onChange={(e) => setAccountIndustry(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Contact Selection */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                <StepHeader n={2} title="Contact" description="Link to an existing contact or create a new contact record" />
                {matchedContact && (
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <ChoiceCard
                      selected={contactMode === "existing"}
                      onClick={() => setContactMode("existing")}
                      icon={<UserIcon className="h-4 w-4" />}
                      title="Link Existing Contact"
                      subtitle={`${matchedContact.first_name} ${matchedContact.last_name}`}
                      subtitleColor="text-[#18A7B8] font-bold"
                    />
                    <ChoiceCard
                      selected={contactMode === "new"}
                      onClick={() => setContactMode("new")}
                      icon={<Plus className="h-4 w-4" />}
                      title="Create New Contact"
                      subtitle="Create contact record"
                    />
                  </div>
                )}
                {contactMode === "new" && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 animate-in fade-in duration-200">
                    <div>
                      <label className={labelStyle}>First Name</label>
                      <input className={fieldStyle} value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Last Name</label>
                      <input className={fieldStyle} value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Email</label>
                      <input className={fieldStyle} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Phone</label>
                      <PhoneInput
                        label=""
                        country={contactPhoneCountry}
                        value={contactPhone}
                        onCountryChange={setContactPhoneCountry}
                        onValueChange={setContactPhone}
                        inputClassName={fieldStyle}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Opportunity Selection */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                <StepHeader
                  n={3}
                  title="Opportunity (Deal)"
                  description="Create a new opportunity associated with this converted account"
                  right={<Switch checked={createOpportunity} onChange={setCreateOpportunity} aria-label="Create opportunity" />}
                />
                {createOpportunity && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1.5 animate-in fade-in duration-200">
                    <div className="col-span-2">
                      <label className={labelStyle}>Opportunity Name</label>
                      <input className={fieldStyle} value={oppName} onChange={(e) => setOppName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelStyle}>Stage</label>
                      <select className={fieldStyle} value={oppStage} onChange={(e) => setOppStage(e.target.value as OpportunityStage)}>
                        {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelStyle}>Amount ($)</label>
                      <input type="number" min="0" placeholder="0" className={fieldStyle} value={oppAmount} onChange={(e) => setOppAmount(e.target.value)} />
                    </div>
                    <div className="col-span-4">
                      <label className={labelStyle}>Close Date</label>
                      <input type="date" className={fieldStyle} value={oppCloseDate} onChange={(e) => setOppCloseDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Conversion summary layout */}
              <div className="rounded-2xl border border-teal-100 bg-teal-50/40 dark:border-teal-900/30 dark:bg-teal-950/20 p-4 space-y-3 text-xs">
                <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-[#18A7B8]" /> Conversion Summary
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[9px] font-bold text-slate-450 uppercase tracking-wider"><UserIcon className="h-3 w-3" /> Prospect</p>
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-bold truncate">{lead.full_name || lead.company_name || "—"}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[9px] font-bold text-slate-450 uppercase tracking-wider"><Building2 className="h-3 w-3" /> Account</p>
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-bold truncate flex items-center gap-1.5">
                      {effectiveAccountName || "—"}
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.2 rounded-full", accountMode === "existing" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                        {accountMode === "existing" ? "Link" : "New"}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[9px] font-bold text-slate-450 uppercase tracking-wider"><UserIcon className="h-3 w-3" /> Contact</p>
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-bold truncate">{effectiveContactName || "—"}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 p-3 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-200 font-semibold leading-relaxed">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                  <span>Converting this prospect will change its status to Converted and create linked account/contact objects.</span>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl px-4 py-2 font-semibold text-sm border-slate-200 dark:border-slate-855 h-10">
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={saving || loadingMatches} className="rounded-xl px-5 py-2 bg-[#18A7B8] hover:bg-[#1594a4] text-white font-bold h-10 shadow-sm flex items-center gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Complete Conversion
          </Button>
        </div>
      </div>
    </div>
  );
}
