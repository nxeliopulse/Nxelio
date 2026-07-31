"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, Loader2, Building2, User as UserIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { getConversionMatches, convertLead } from "@/lib/queries/lead-conversion";
import type { AccountRow } from "@/lib/queries/accounts";
import type { ContactRow } from "@/lib/queries/contacts";
import { OPPORTUNITY_STAGES, STAGE_LABELS, type OpportunityStage } from "@/lib/opportunities";
import type { LeadRow } from "@/lib/queries/leads";

function splitName(fullName: string | null): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
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
      toast("Lead converted.", "success");
      onConverted(result);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Conversion failed. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "text-xs font-medium text-slate-600";

  return (
    <Modal open={open} onClose={onClose} title={`Convert Lead: ${lead.full_name || lead.company_name || "Lead"}`} description="Create or link an Account, Contact, and optional Opportunity" size="lg">
      <div className="p-5 space-y-5">
        {loadingMatches ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for existing matches…
          </div>
        ) : (
          <>
            {/* Account section */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Building2 className="h-4 w-4 text-slate-400" /> Account</p>
              {matchedAccount && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" checked={accountMode === "existing"} onChange={() => setAccountMode("existing")} />
                  Use existing Account: <span className="font-medium">{matchedAccount.account_name}</span>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={accountMode === "new"} onChange={() => setAccountMode("new")} />
                Create new Account
              </label>
              {accountMode === "new" && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div>
                    <label className={label}>Account name</label>
                    <input className={field} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Website</label>
                    <input className={field} value={accountWebsite} onChange={(e) => setAccountWebsite(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={label}>Industry</label>
                    <input className={field} value={accountIndustry} onChange={(e) => setAccountIndustry(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Contact section */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><UserIcon className="h-4 w-4 text-slate-400" /> Contact</p>
              {matchedContact && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" checked={contactMode === "existing"} onChange={() => setContactMode("existing")} />
                  Use existing Contact: <span className="font-medium">{matchedContact.first_name} {matchedContact.last_name}</span>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={contactMode === "new"} onChange={() => setContactMode("new")} />
                Create new Contact
              </label>
              {contactMode === "new" && (
                <div className="grid grid-cols-2 gap-3 pl-6">
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

            {/* Opportunity section */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <input type="checkbox" checked={createOpportunity} onChange={(e) => setCreateOpportunity(e.target.checked)} />
                <Briefcase className="h-4 w-4 text-slate-400" /> Create Opportunity
              </label>
              {createOpportunity && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="col-span-2">
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
                  <div className="col-span-2">
                    <label className={label}>Close date</label>
                    <input type="date" className={field} value={oppCloseDate} onChange={(e) => setOppCloseDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleConvert} disabled={saving || loadingMatches}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Complete Conversion
        </Button>
      </div>
    </Modal>
  );
}
