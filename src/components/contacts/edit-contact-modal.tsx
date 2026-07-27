"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { X, User, Building2, Search, Store, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn } from "@/lib/utils";
import { createContact, updateContact, type ContactRow } from "@/lib/queries/contacts";
import { getAccounts, type AccountRow } from "@/lib/queries/accounts";

const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const LEAD_SOURCES = [
  "Advertisement",
  "Cold Call",
  "Employee Referral",
  "External Referral",
  "Online Store",
  "Partner",
  "Public Relations",
  "Sales Email",
  "Trade Show",
  "Web Form",
  "Web Research",
  "LinkedIn",
];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Australia", "India", "Germany", "France", "Japan"];

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3">
      <label className="text-xs font-medium text-slate-600 text-right whitespace-nowrap truncate" title={label}>
        {label}
      </label>
      <div className="relative flex items-center w-full">
        {required && <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-md z-10" />}
        {children}
      </div>
    </div>
  );
}

export function EditContactModal({
  open,
  onClose,
  contact,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  contact?: ContactRow;
  defaultAccountId?: string;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const isEdit = Boolean(contact);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const initialForm = {
    contact_owner: "Hari",
    account_id: contact?.account_id || defaultAccountId || "",
    salutation: contact?.salutation || "",
    first_name: contact?.first_name || "",
    last_name: contact?.last_name || "",
    vendor_name: "",
    email: contact?.email || "",
    secondary_email: contact?.secondary_email || "",
    phone: contact?.phone || "",
    other_phone: "",
    mobile: contact?.mobile || "",
    home_phone: "",
    fax: "",
    assistant: "",
    asst_phone: "",
    dob: "",
    department: contact?.department || "",
    job_title: contact?.job_title || "",
    lead_source: contact?.lead_source || "",
    email_opt_out: false,
    mailing_building: "",
    mailing_street: contact?.mailing_street || "",
    mailing_city: contact?.mailing_city || "",
    mailing_state: contact?.mailing_state || "",
    mailing_country: contact?.mailing_country || "",
    mailing_zip: contact?.mailing_zip || "",
    skype_id: contact?.skype_id || "",
    twitter: contact?.twitter || "",
    description: contact?.description || "",
  };

  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [open]);

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(andNew = false) {
    if (!form.last_name.trim()) {
      setError("Last name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        account_id: form.account_id || null,
        salutation: form.salutation || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        mobile: form.mobile.trim() || null,
        department: form.department.trim() || null,
        job_title: form.job_title.trim() || null,
        lead_source: form.lead_source.trim() || null,
        mailing_street: [form.mailing_building, form.mailing_street].filter(Boolean).join(", ").trim() || null,
        mailing_city: form.mailing_city.trim() || null,
        mailing_state: form.mailing_state.trim() || null,
        mailing_country: form.mailing_country.trim() || null,
        mailing_zip: form.mailing_zip.trim() || null,
        skype_id: form.skype_id.trim() || null,
        secondary_email: form.secondary_email.trim() || null,
        twitter: form.twitter.trim() || null,
        description: form.description.trim() || null,
      };
      if (isEdit && contact) {
        await updateContact(contact.id, payload);
        toast("Contact updated.", "success");
      } else {
        await createContact(payload);
        toast("Contact created.", "success");
      }
      if (andNew) {
        setForm(initialForm);
        toast("Contact saved — ready for new entry", "success");
      } else {
        onClose();
      }
      router.refresh();
    } catch {
      toast("Couldn't save changes. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = "w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50";
  const selectStyle = "w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-7";
  const { collapsed } = useSidebar();

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed top-16 bottom-0 right-0 z-20 bg-slate-100 flex flex-col overflow-hidden text-slate-900 transition-all duration-300 ease-in-out",
        collapsed ? "left-0 lg:left-[84px]" : "left-0 lg:left-[210px]"
      )}
    >
      {/* Subheader Action Bar */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">{isEdit ? "Edit Contact" : "Create Contact"}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-7 text-xs px-3 text-slate-700">Cancel</Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving} className="h-7 text-xs px-3 text-slate-700">Save and New</Button>
          <Button size="sm" onClick={() => handleSave(false)} disabled={saving} className="h-7 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium">Save</Button>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 ml-2">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="overflow-auto flex-1 p-6 sm:p-8 space-y-8 bg-white w-full">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Contact Image */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 mb-3">Contact Image</h3>
          <div className="h-14 w-14 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400">
            <User className="h-7 w-7" />
          </div>
        </div>

        {/* Contact Information */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 mb-4 pb-1 border-b border-slate-100">Contact Information</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-3">
            {/* Left Column */}
            <FormRow label="Contact Owner">
              <div className="relative w-full">
                <select className={selectStyle} value={form.contact_owner} onChange={(e) => set("contact_owner", e.target.value)}>
                  <option value="Hari">Hari</option>
                </select>
                <div className="absolute right-2 top-1.5 pointer-events-none text-slate-400 bg-slate-100 p-0.5 rounded border border-slate-200">
                  <User className="h-3 w-3" />
                </div>
              </div>
            </FormRow>

            <FormRow label="Lead Source">
              <select className={selectStyle} value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)}>
                <option value="">-None-</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>

            <FormRow label="First Name">
              <div className="grid grid-cols-[90px_1fr] gap-2 w-full">
                <select className={selectStyle} value={form.salutation} onChange={(e) => set("salutation", e.target.value)}>
                  <option value="">-None-</option>
                  {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" placeholder="First Name" className={inputStyle} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </div>
            </FormRow>

            <FormRow label="Last Name" required>
              <input type="text" className={inputStyle} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </FormRow>

            <FormRow label="Account Name">
              <div className="relative w-full">
                <select className={selectStyle} value={form.account_id} onChange={(e) => set("account_id", e.target.value)}>
                  <option value="">Select Account...</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
                <div className="absolute right-2 top-1.5 pointer-events-none text-slate-400 bg-slate-100 p-0.5 rounded border border-slate-200">
                  <Building2 className="h-3 w-3" />
                </div>
              </div>
            </FormRow>

            <FormRow label="Vendor Name">
              <div className="relative w-full">
                <input type="text" className={inputStyle + " pr-7"} value={form.vendor_name} onChange={(e) => set("vendor_name", e.target.value)} />
                <div className="absolute right-2 top-1.5 text-slate-400 bg-slate-100 p-0.5 rounded border border-slate-200">
                  <Store className="h-3 w-3" />
                </div>
              </div>
            </FormRow>

            <FormRow label="Email">
              <input type="email" className={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </FormRow>

            <FormRow label="Title">
              <input type="text" className={inputStyle} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
            </FormRow>

            <FormRow label="Phone">
              <input type="text" className={inputStyle} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </FormRow>

            <FormRow label="Department">
              <input type="text" className={inputStyle} value={form.department} onChange={(e) => set("department", e.target.value)} />
            </FormRow>

            <FormRow label="Other Phone">
              <input type="text" className={inputStyle} value={form.other_phone} onChange={(e) => set("other_phone", e.target.value)} />
            </FormRow>

            <FormRow label="Home Phone">
              <input type="text" className={inputStyle} value={form.home_phone} onChange={(e) => set("home_phone", e.target.value)} />
            </FormRow>

            <FormRow label="Mobile">
              <input type="text" className={inputStyle} value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </FormRow>

            <FormRow label="Fax">
              <input type="text" className={inputStyle} value={form.fax} onChange={(e) => set("fax", e.target.value)} />
            </FormRow>

            <FormRow label="Assistant">
              <input type="text" className={inputStyle} value={form.assistant} onChange={(e) => set("assistant", e.target.value)} />
            </FormRow>

            <FormRow label="Date of Birth">
              <div className="relative w-full">
                <input type="text" placeholder="MMM D, YYYY" className={inputStyle + " pr-7"} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
                <Calendar className="h-3.5 w-3.5 absolute right-2 text-slate-400" />
              </div>
            </FormRow>

            <FormRow label="Asst Phone">
              <input type="text" className={inputStyle} value={form.asst_phone} onChange={(e) => set("asst_phone", e.target.value)} />
            </FormRow>

            <FormRow label="Email Opt Out">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={form.email_opt_out} onChange={(e) => set("email_opt_out", e.target.checked)} />
            </FormRow>

            <FormRow label="Skype ID">
              <input type="text" className={inputStyle} value={form.skype_id} onChange={(e) => set("skype_id", e.target.value)} />
            </FormRow>

            <FormRow label="Secondary Email">
              <input type="email" className={inputStyle} value={form.secondary_email} onChange={(e) => set("secondary_email", e.target.value)} />
            </FormRow>
          </div>
        </div>

        {/* Address Information */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 mb-4 pb-1 border-b border-slate-100">Address Information</h3>
          <fieldset className="border border-slate-200 rounded-lg p-4 pt-3 bg-slate-50/30 max-w-2xl">
            <legend className="px-2 text-xs font-semibold text-slate-700">Mailing Address</legend>
            <div className="space-y-3">
              <FormRow label="Country / Region">
                <select className={selectStyle} value={form.mailing_country} onChange={(e) => set("mailing_country", e.target.value)}>
                  <option value="">-None-</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormRow>
              <FormRow label="Flat / House No.">
                <input type="text" className={inputStyle} value={form.mailing_building} onChange={(e) => set("mailing_building", e.target.value)} />
              </FormRow>
              <FormRow label="Street">
                <input type="text" className={inputStyle} value={form.mailing_street} onChange={(e) => set("mailing_street", e.target.value)} />
              </FormRow>
              <FormRow label="City">
                <input type="text" className={inputStyle} value={form.mailing_city} onChange={(e) => set("mailing_city", e.target.value)} />
              </FormRow>
              <FormRow label="State">
                <input type="text" className={inputStyle} value={form.mailing_state} onChange={(e) => set("mailing_state", e.target.value)} />
              </FormRow>
              <FormRow label="Zip Code">
                <input type="text" className={inputStyle} value={form.mailing_zip} onChange={(e) => set("mailing_zip", e.target.value)} />
              </FormRow>
            </div>
          </fieldset>
        </div>

        {/* Description Information */}
        <div className="pt-2">
          <h3 className="text-xs font-bold text-slate-800 mb-3 pb-1 border-b border-slate-100">Description Information</h3>
          <textarea className="w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[90px]" placeholder="Add description notes..." value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
