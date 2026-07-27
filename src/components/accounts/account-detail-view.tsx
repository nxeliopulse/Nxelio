"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Pencil, Trash2, MoreHorizontal, ChevronDown, ChevronUp,
  Globe, Phone, Users2, Plus, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { EditAccountModal } from "@/components/accounts/edit-account-modal";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { deleteAccount, type AccountRow } from "@/lib/queries/accounts";
import type { ContactRow } from "@/lib/queries/contacts";
import { formatDateTime } from "@/lib/utils";

export function AccountDetailView({ account, contacts }: { account: AccountRow; contacts: ContactRow[] }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [, startDelete] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);

  const [aboutOpen, setAboutOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(true);
  const [contactsOpen, setContactsOpen] = useState(true);

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete account?", message: `Delete ${account.account_name}? This can't be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteAccount(account.id);
        toast("Account deleted.", "success");
        router.push("/accounts");
      } catch {
        toast("Couldn't delete account.", "error");
      }
    });
  }

  const billing = [account.billing_street, account.billing_city, account.billing_state, account.billing_zip, account.billing_country].filter(Boolean).join(", ");
  const shipping = [account.shipping_street, account.shipping_city, account.shipping_state, account.shipping_zip, account.shipping_country].filter(Boolean).join(", ");

  return (
    <div className="max-w-[1650px] mx-auto pb-10 text-slate-800">
      <div className="flex items-center justify-between mb-3 px-1">
        <Link href="/accounts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Accounts
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-[#1d4ed8] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight">{account.account_name}</h1>
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
                <Field label="Phone" value={account.phone} icon={<Phone className="h-3 w-3" />} />
                <Field label="Website" value={account.website ? <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">{account.website} <ExternalLink className="h-3 w-3" /></a> : null} icon={<Globe className="h-3 w-3" />} />
                <Field label="Industry" value={account.industry} />
                <Field label="Account type" value={account.account_type} />
                <Field label="Employees" value={account.employees != null ? String(account.employees) : null} />
                <Field label="Annual revenue" value={account.annual_revenue != null ? account.annual_revenue.toLocaleString() : null} />
                <Field label="Ownership" value={account.ownership} />
                <Field label="Rating" value={account.rating ? <Badge variant={account.rating === "Hot" ? "danger" : account.rating === "Warm" ? "warning" : "blue"}>{account.rating}</Badge> : null} />
                <Field label="Ticker symbol" value={account.ticker_symbol} />
                {account.description && (
                  <div className="col-span-2 border-t border-slate-100 pt-3">
                    <span className="block text-slate-500 font-medium mb-0.5">Description</span>
                    <span className="text-slate-700 whitespace-pre-wrap">{account.description}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <button onClick={() => setAddressOpen((v) => !v)} className="w-full px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-left font-bold text-sm text-slate-800">
              <span className="inline-flex items-center gap-2">
                {addressOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Addresses
              </span>
            </button>
            {addressOpen && (
              <div className="p-4 grid grid-cols-2 gap-3.5 text-xs">
                <div>
                  <span className="block text-slate-500 font-medium mb-0.5">Billing address</span>
                  <span className="font-semibold text-slate-800">{billing || "—"}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium mb-0.5">Shipping address</span>
                  <span className="font-semibold text-slate-800">{shipping || "—"}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <button onClick={() => setContactsOpen((v) => !v)} className="w-full px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-left font-bold text-sm text-slate-800">
              <span className="inline-flex items-center gap-2">
                {contactsOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                Contacts ({contacts.length})
              </span>
              <Plus className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 cursor-pointer" onClick={(e) => { e.stopPropagation(); setAddContactOpen(true); }} />
            </button>
            {contactsOpen && (
              <div className="p-4 space-y-3 text-xs">
                {contacts.length === 0 ? (
                  <p className="text-slate-400 italic">No contacts linked to this account yet.</p>
                ) : (
                  contacts.map((c) => (
                    <Link key={c.id} href={`/contacts/${c.id}`} className="block p-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                          <Users2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> {`${c.first_name} ${c.last_name}`.trim()}
                        </p>
                        <ExternalLink className="h-3 w-3 text-slate-300 flex-shrink-0" />
                      </div>
                      {c.job_title && <p className="text-slate-500 mt-1 truncate">{c.job_title}</p>}
                    </Link>
                  ))
                )}
                <Link href={`/contacts?account=${account.id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1">
                  View All Contacts →
                </Link>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 px-1">Last updated {formatDateTime(account.updated_at)}</p>
        </div>
      </div>

      <EditAccountModal open={editOpen} onClose={() => setEditOpen(false)} account={account} />
      <EditContactModal open={addContactOpen} onClose={() => setAddContactOpen(false)} defaultAccountId={account.id} />
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
