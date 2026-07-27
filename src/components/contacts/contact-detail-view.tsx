"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, UserCheck, Pencil, Trash2, MoreHorizontal, ChevronDown, ChevronUp,
  Mail, Phone, Building2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { deleteContact, type ContactWithAccount } from "@/lib/queries/contacts";
import { formatDateTime } from "@/lib/utils";

export function ContactDetailView({ contact }: { contact: ContactWithAccount }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [, startDelete] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(true);

  const displayName = `${contact.first_name} ${contact.last_name}`.trim();

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete contact?", message: `Delete ${displayName}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteContact(contact.id);
        toast("Contact deleted.", "success");
        router.push("/contacts");
      } catch {
        toast("Couldn't delete contact.", "error");
      }
    });
  }

  const mailing = [contact.mailing_street, contact.mailing_city, contact.mailing_state, contact.mailing_zip, contact.mailing_country].filter(Boolean).join(", ");

  return (
    <div className="max-w-[1650px] mx-auto pb-10 text-slate-800">
      <div className="flex items-center justify-between mb-3 px-1">
        <Link href="/contacts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Contacts
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-[#6b21a8] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <UserCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight">{displayName || "—"}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="rounded-lg text-xs font-semibold">
              <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit
            </Button>
            <div className="relative">
              <Button variant="outline" size="icon" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg text-xs">
                    <button onClick={() => { setMenuOpen(false); setEditOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit Record
                    </button>
                    <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-3.5 w-3.5" /> Delete Record
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <button onClick={() => setAboutOpen((v) => !v)} className="w-full px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-left font-bold text-sm text-slate-800">
              <span className="inline-flex items-center gap-2">
                {aboutOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                About
              </span>
              <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditOpen(true); }} />
            </button>
            {aboutOpen && (
              <div className="p-4 grid grid-cols-2 gap-3.5 text-xs">
                <Field label="Email" value={contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a> : null} icon={<Mail className="h-3 w-3" />} />
                <Field label="Phone" value={contact.phone ? <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a> : null} icon={<Phone className="h-3 w-3" />} />
                <Field label="Mobile" value={contact.mobile} />
                <Field label="Job title" value={contact.job_title} />
                <Field label="Department" value={contact.department} />
                <Field
                  label="Account"
                  value={contact.account ? <Link href={`/accounts/${contact.account.id}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">{contact.account.account_name} <ExternalLink className="h-3 w-3" /></Link> : null}
                  icon={<Building2 className="h-3 w-3" />}
                />
                <Field label="Lead source" value={contact.lead_source} />
                <Field label="Twitter / X" value={contact.twitter ? <a href={`https://x.com/${contact.twitter.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@{contact.twitter.replace(/^@/, "")}</a> : null} />
                <Field label="Skype ID" value={contact.skype_id} />
                <Field label="Secondary email" value={contact.secondary_email} />
                {contact.description && (
                  <div className="col-span-2 border-t border-slate-100 pt-3">
                    <span className="block text-slate-500 font-medium mb-0.5">Description</span>
                    <span className="text-slate-700 whitespace-pre-wrap">{contact.description}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <button onClick={() => setAddressOpen((v) => !v)} className="w-full px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-left font-bold text-sm text-slate-800">
              <span className="inline-flex items-center gap-2">
                {addressOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Mailing address
              </span>
            </button>
            {addressOpen && (
              <div className="p-4 text-xs">
                <span className="font-semibold text-slate-800">{mailing || "—"}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          <p className="text-[11px] text-slate-400 px-1">Last updated {formatDateTime(contact.updated_at)}</p>
        </div>
      </div>

      <EditContactModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <span className="flex items-center gap-1 text-slate-500 font-medium mb-0.5">{icon}{label}</span>
      <span className="font-semibold text-slate-900">{value ?? "—"}</span>
    </div>
  );
}
