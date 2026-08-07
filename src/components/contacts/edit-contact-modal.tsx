"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { X, User, MapPin, Share2, Lock, Upload, Star, ChevronDown, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { createContact, updateContact, type ContactRow } from "@/lib/queries/contacts";
import { getAccounts, type AccountRow } from "@/lib/queries/accounts";
import { uploadContactPhoto } from "@/lib/storage/upload";
import type { OwnerOption } from "@/components/contacts/contacts-table";

const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Consulting", "Other"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Mandarin", "Arabic", "Hindi", "Japanese"];
const CURRENCIES = ["US Dollar", "Euro", "British Pound", "Indian Rupee", "Australian Dollar", "Canadian Dollar", "Japanese Yen"];
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

type SectionKey = "basic" | "address" | "social" | "access";

const labelStyle = "block text-[11px] font-bold text-slate-600 uppercase mb-1.5";
const fieldStyle = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] transition";

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className={labelStyle}>{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}

/** Collapsible section — icon + title on the left, chevron on the right, closed by default; fields only render once expanded. */
function Section({
  icon: Icon, title, open, onToggle, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3.5 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon className="h-4 w-4 text-slate-500" />
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="p-4 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">{children}</div>
        </div>
      )}
    </div>
  );
}

export function EditContactModal({
  open,
  onClose,
  contact,
  defaultAccountId,
  owners = [],
}: {
  open: boolean;
  onClose: () => void;
  contact?: ContactRow;
  defaultAccountId?: string;
  owners?: OwnerOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const isEdit = Boolean(contact);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const initialForm = {
    contact_owner: contact?.contact_owner || "",
    account_id: contact?.account_id || defaultAccountId || "",
    salutation: contact?.salutation || "",
    first_name: contact?.first_name || "",
    last_name: contact?.last_name || "",
    vendor_name: "",
    email: contact?.email || "",
    secondary_email: contact?.secondary_email || "",
    phone: contact?.phone || "",
    other_phone: contact?.other_phone || "",
    mobile: contact?.mobile || "",
    home_phone: contact?.home_phone || "",
    fax: contact?.fax || "",
    assistant: contact?.assistant_name || "",
    asst_phone: contact?.assistant_phone || "",
    dob: contact?.date_of_birth || "",
    department: contact?.department || "",
    job_title: contact?.job_title || "",
    lead_source: contact?.lead_source || "",
    email_opt_out: contact?.email_opt_out ?? false,
    mailing_building: "",
    mailing_street: contact?.mailing_street || "",
    mailing_city: contact?.mailing_city || "",
    mailing_state: contact?.mailing_state || "",
    mailing_country: contact?.mailing_country || "",
    mailing_zip: contact?.mailing_zip || "",
    skype_id: contact?.skype_id || "",
    twitter: contact?.twitter || "",
    linkedin: contact?.linkedin || "",
    facebook: contact?.facebook || "",
    whatsapp: contact?.whatsapp || "",
    instagram: contact?.instagram || "",
    youtube: contact?.youtube || "",
    pinterest: contact?.pinterest || "",
    description: contact?.description || "",
    photo_url: contact?.photo_url || "",
    rating: contact?.rating != null ? String(contact.rating) : "",
    industry: contact?.industry || "",
    language: contact?.language || "",
    currency: contact?.currency || "",
    visibility: contact?.visibility || "public",
  };
  const initialTags = (contact?.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const initialVisibleTo = (contact?.visible_to || "").split(",").map((t) => t.trim()).filter(Boolean);

  const [form, setForm] = useState(initialForm);
  const [tagsList, setTagsList] = useState<string[]>(initialTags);
  const [visibleTo, setVisibleTo] = useState<string[]>(initialVisibleTo);
  const [tagInput, setTagInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    basic: false, address: false, social: false, access: false,
  });

  useEffect(() => {
    if (!open) return;
    getAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [open]);

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSection(key: SectionKey) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function commitTag() {
    const value = tagInput.trim();
    if (value && !tagsList.includes(value)) setTagsList((t) => [...t, value]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTagsList((t) => t.filter((x) => x !== tag));
  }

  function toggleVisibleTo(id: string) {
    setVisibleTo((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && !tagInput && tagsList.length) {
      setTagsList((t) => t.slice(0, -1));
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    if (file.size > 800 * 1024) {
      setPhotoError("File too large (max 800K)");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadContactPhoto(fd);
      if (result.ok && result.url) {
        set("photo_url", result.url);
      } else {
        setPhotoError(result.error || "Upload failed");
      }
    } catch {
      setPhotoError("Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave(andNew = false) {
    if (!form.last_name.trim()) {
      setError("Last name is required.");
      setOpenSections((s) => ({ ...s, basic: true }));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        account_id: form.account_id || null,
        contact_owner: form.contact_owner || null,
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
        linkedin: form.linkedin.trim() || null,
        facebook: form.facebook.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        instagram: form.instagram.trim() || null,
        youtube: form.youtube.trim() || null,
        pinterest: form.pinterest.trim() || null,
        email_opt_out: form.email_opt_out,
        description: form.description.trim() || null,
        other_phone: form.other_phone.trim() || null,
        home_phone: form.home_phone.trim() || null,
        fax: form.fax.trim() || null,
        assistant_name: form.assistant.trim() || null,
        assistant_phone: form.asst_phone.trim() || null,
        date_of_birth: form.dob || null,
        photo_url: form.photo_url || null,
        tags: tagsList.length ? tagsList.join(", ") : null,
        rating: form.rating ? Number(form.rating) : null,
        industry: form.industry || null,
        language: form.language || null,
        currency: form.currency || null,
        visibility: form.visibility,
        visible_to: form.visibility === "select_people" && visibleTo.length ? visibleTo.join(", ") : null,
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

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50 transition-opacity" onClick={onClose} />

      {/* Right side drawer */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[760px] bg-white shadow-2xl border-l border-slate-200 flex flex-col h-screen animate-in slide-in-from-right duration-250">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base text-slate-900 leading-tight flex items-center gap-1.5">
              <User className="h-4.5 w-4.5 text-[var(--primary)]" /> {isEdit ? "Edit Contact" : "Add New Contact"}
            </h2>
            <p className="text-[10px] text-slate-450 mt-1 uppercase tracking-wider font-bold">
              {isEdit ? `Update details for ${contact?.first_name} ${contact?.last_name}`.trim() : "Create a new contact record"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-450 hover:bg-slate-200 rounded-lg p-1.5 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {error && (
            <p className="text-xs font-bold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200">
              {error}
            </p>
          )}

          <Section icon={User} title="Basic Info" open={openSections.basic} onToggle={() => toggleSection("basic")}>
            <div className="sm:col-span-2 flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden flex-shrink-0">
                {form.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a static asset
                  <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6" />
                )}
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={handlePhotoSelect} />
                <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="h-8 text-xs px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingPhoto ? "Uploading..." : "Upload file"}
                </Button>
                <p className="text-[11px] text-slate-400 mt-1">JPG, GIF or PNG. Max size of 800K</p>
                {photoError && <p className="text-[11px] text-red-600 mt-0.5">{photoError}</p>}
              </div>
            </div>

            <Field label="First Name" required>
              <input className={fieldStyle} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="First Name" />
            </Field>
            <Field label="Last Name" required>
              <input className={fieldStyle} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Last Name" />
            </Field>
            <Field label="Job Title" required>
              <input className={fieldStyle} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Job Title" />
            </Field>
            <Field label="Company Name" required>
              <select className={fieldStyle} value={form.account_id} onChange={(e) => set("account_id", e.target.value)}>
                <option value="">Select...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </Field>

            <Field label="Email" required className="sm:col-span-2">
              <div className="flex items-center gap-3">
                <input type="email" className={fieldStyle} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" />
                <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                  <span className="text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">Opt Out</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.email_opt_out}
                    onClick={() => set("email_opt_out", !form.email_opt_out)}
                    className={cn("relative h-5 w-9 rounded-full transition-colors flex-shrink-0", form.email_opt_out ? "bg-red-500" : "bg-slate-300")}
                  >
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", form.email_opt_out ? "translate-x-4" : "translate-x-0.5")} />
                  </button>
                </label>
              </div>
            </Field>

            <Field label="Phone 1">
              <input className={fieldStyle} placeholder="(201) 555-0123" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Phone 2">
              <input className={fieldStyle} placeholder="(201) 555-0123" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </Field>
            <Field label="Fax">
              <input className={fieldStyle} value={form.fax} onChange={(e) => set("fax", e.target.value)} />
            </Field>
            <Field label="Date of Birth">
              <input type="date" className={fieldStyle} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </Field>
            <Field label="Owner">
              <select className={fieldStyle} value={form.contact_owner} onChange={(e) => set("contact_owner", e.target.value)}>
                <option value="">-None-</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Rating">
              <div className="relative">
                <input type="number" min={1} max={5} placeholder="1-5" className={fieldStyle + " pr-8"} value={form.rating} onChange={(e) => set("rating", e.target.value)} />
                <Star className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </Field>

            <Field label="Tags" className="sm:col-span-2">
              <div className="w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 focus-within:ring-1 focus-within:ring-[var(--primary)]/35 focus-within:border-[var(--primary)]">
                {tagsList.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium pl-2 pr-1 py-0.5">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="flex-1 min-w-[80px] text-sm outline-none py-0.5"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTag}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Enter value separated by comma</p>
            </Field>

            <Field label="Source" required>
              <select className={fieldStyle} value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)}>
                <option value="">-None-</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Industry" required>
              <select className={fieldStyle} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                <option value="">-None-</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>

            <Field label="Language">
              <select className={fieldStyle} value={form.language} onChange={(e) => set("language", e.target.value)}>
                <option value="">-None-</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <select className={fieldStyle} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                <option value="">-None-</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="Description" required className="sm:col-span-2">
              <textarea className={fieldStyle + " min-h-[90px] resize-y"} placeholder="Add description notes..." value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>

            <Field label="Salutation">
              <select className={fieldStyle} value={form.salutation} onChange={(e) => set("salutation", e.target.value)}>
                <option value="">-None-</option>
                {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <input className={fieldStyle} value={form.department} onChange={(e) => set("department", e.target.value)} />
            </Field>
            <Field label="Vendor Name">
              <input className={fieldStyle} value={form.vendor_name} onChange={(e) => set("vendor_name", e.target.value)} />
            </Field>
            <Field label="Secondary Email">
              <input type="email" className={fieldStyle} value={form.secondary_email} onChange={(e) => set("secondary_email", e.target.value)} />
            </Field>
            <Field label="Home Phone">
              <input className={fieldStyle} value={form.home_phone} onChange={(e) => set("home_phone", e.target.value)} />
            </Field>
            <Field label="Other Phone">
              <input className={fieldStyle} value={form.other_phone} onChange={(e) => set("other_phone", e.target.value)} />
            </Field>
            <Field label="Assistant">
              <input className={fieldStyle} value={form.assistant} onChange={(e) => set("assistant", e.target.value)} />
            </Field>
            <Field label="Asst Phone">
              <input className={fieldStyle} value={form.asst_phone} onChange={(e) => set("asst_phone", e.target.value)} />
            </Field>
          </Section>

          <Section icon={MapPin} title="Address Info" open={openSections.address} onToggle={() => toggleSection("address")}>
            <Field label="Country / Region">
              <select className={fieldStyle} value={form.mailing_country} onChange={(e) => set("mailing_country", e.target.value)}>
                <option value="">-None-</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Flat / House No.">
              <input className={fieldStyle} value={form.mailing_building} onChange={(e) => set("mailing_building", e.target.value)} />
            </Field>
            <Field label="Street" className="sm:col-span-2">
              <input className={fieldStyle} value={form.mailing_street} onChange={(e) => set("mailing_street", e.target.value)} />
            </Field>
            <Field label="City">
              <input className={fieldStyle} value={form.mailing_city} onChange={(e) => set("mailing_city", e.target.value)} />
            </Field>
            <Field label="State">
              <input className={fieldStyle} value={form.mailing_state} onChange={(e) => set("mailing_state", e.target.value)} />
            </Field>
            <Field label="Zip Code">
              <input className={fieldStyle} value={form.mailing_zip} onChange={(e) => set("mailing_zip", e.target.value)} />
            </Field>
          </Section>

          <Section icon={Share2} title="Social Profile" open={openSections.social} onToggle={() => toggleSection("social")}>
            <Field label="Facebook">
              <input className={fieldStyle} value={form.facebook} onChange={(e) => set("facebook", e.target.value)} />
            </Field>
            <Field label="Skype">
              <input className={fieldStyle} value={form.skype_id} onChange={(e) => set("skype_id", e.target.value)} />
            </Field>
            <Field label="LinkedIn">
              <input className={fieldStyle} placeholder="linkedin.com/in/..." value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} />
            </Field>
            <Field label="Twitter">
              <input className={fieldStyle} placeholder="@handle" value={form.twitter} onChange={(e) => set("twitter", e.target.value)} />
            </Field>
            <Field label="Whatsapp">
              <input className={fieldStyle} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
            <Field label="Instagram">
              <input className={fieldStyle} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
            </Field>
            <Field label="YouTube">
              <input className={fieldStyle} value={form.youtube} onChange={(e) => set("youtube", e.target.value)} />
            </Field>
            <Field label="Pinterest">
              <input className={fieldStyle} value={form.pinterest} onChange={(e) => set("pinterest", e.target.value)} />
            </Field>
          </Section>

          <Section icon={Lock} title="Access" open={openSections.access} onToggle={() => toggleSection("access")}>
            <Field label="Visibility" className="sm:col-span-2">
              <div className="flex items-center gap-6">
                {(["public", "private", "select_people"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="contact-visibility"
                      className="accent-teal-600"
                      checked={form.visibility === v}
                      onChange={() => set("visibility", v)}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {v === "public" ? "Public" : v === "private" ? "Private" : "Select People"}
                    </span>
                  </label>
                ))}
              </div>

              {form.visibility === "select_people" && (
                <div className="mt-3 border border-slate-200 rounded-xl p-3 max-h-40 overflow-auto space-y-1.5">
                  {owners.length === 0 && <p className="text-xs text-slate-400">No users available.</p>}
                  {owners.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" checked={visibleTo.includes(o.id)} onChange={() => toggleVisibleTo(o.id)} />
                      <span className="text-xs text-slate-700">{o.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>

            <div className="sm:col-span-2 flex items-center gap-2.5 pt-1">
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", form.email_opt_out ? "bg-red-500" : "bg-green-500")} />
              <span className="text-xs font-medium text-slate-700">
                {form.email_opt_out ? "Opted out of marketing/outreach emails" : "Opted in to marketing/outreach emails"}
              </span>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-lg px-4 py-2 font-semibold text-sm border-slate-200 h-10">
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSave(true)} disabled={saving} className="rounded-lg px-4 py-2 font-semibold text-sm border-slate-200 h-10">
            Save and New
          </Button>
          <Button onClick={() => handleSave(false)} disabled={saving} className="rounded-lg px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 shadow-sm">
            {saving ? "Saving…" : isEdit ? "Save" : "Create New"}
          </Button>
        </div>
      </div>
    </>
  );
}
