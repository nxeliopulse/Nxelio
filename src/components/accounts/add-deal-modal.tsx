"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useFeedback } from "@/components/ui/feedback";
import { createOpportunityFromAccount } from "@/lib/queries/opportunities";
import type { OpportunityStage } from "@/lib/opportunities";
import type { AccountOwnerOption } from "@/components/accounts/edit-account-modal";
import type { ContactRow } from "@/lib/queries/contacts";

const PIPELINES = ["Sales", "Marketing", "Calls"];
const STATUSES = ["Open", "Won", "Lost"] as const;
type DealStatus = (typeof STATUSES)[number];
/** Maps the simple 3-value Status shown here to the real, granular stage column
 *  the Opportunities kanban board already uses — "Open" just means "not closed
 *  yet", so it starts at the first open stage. */
const STATUS_TO_STAGE: Record<DealStatus, OpportunityStage> = { Open: "new", Won: "won", Lost: "lost" };
const CURRENCIES = ["Dollar", "Euro", "Pound", "Rupee"];
const PERIODS = ["Days", "Month"];
const SOURCES = ["Advertisement", "Cold Call", "Employee Referral", "External Referral", "Online Store", "Partner", "Public Relations", "Sales Email", "Trade Show", "Web Form", "Web Research", "LinkedIn"];
const PRIORITIES = ["High", "Low", "Medium"] as const;
const AVATAR_COLORS = ["bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500"];

const fieldStyle = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]";
const labelStyle = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5";

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}
function avatarColor(name: string): string {
  return AVATAR_COLORS[hashCode(name) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function Chip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 pl-1.5 pr-2 py-1">
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-slate-400 hover:text-rose-600">
          <X className="h-3 w-3" />
        </button>
      )}
      <span className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarColor(name)}`}>
        {initials(name)}
      </span>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{name}</span>
    </span>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className={labelStyle}>{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}

/** Same "Add New Deal" form as Contact's AddDealModal, but keyed to an Account:
 *  the Account is the fixed chip and Contact becomes an optional pick from the
 *  account's linked contacts (a company-level deal doesn't need one specific
 *  contact assigned). */
export function AddDealModal({
  open,
  onClose,
  accountId,
  accountName,
  contacts = [],
  owners = [],
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  contacts?: ContactRow[];
  owners?: AccountOwnerOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState(`${accountName} — Deal`);
  const [contactId, setContactId] = useState("");
  const [pipeline, setPipeline] = useState("");
  const [status, setStatus] = useState<DealStatus | "">("");
  const [dealValue, setDealValue] = useState("");
  const [currency, setCurrency] = useState("");
  const [period, setPeriod] = useState("");
  const [periodValue, setPeriodValue] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [projectInput, setProjectInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [source, setSource] = useState("");
  const [tags, setTags] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number] | "">("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function commitProject() {
    const v = projectInput.trim();
    if (v && !projects.includes(v)) setProjects((p) => [...p, v]);
    setProjectInput("");
  }

  async function save() {
    if (!name.trim()) { setError("Deal name is required."); return; }
    if (!pipeline) { setError("Pipeline is required."); return; }
    if (!status) { setError("Status is required."); return; }
    if (!dealValue) { setError("Deal value is required."); return; }
    if (!currency) { setError("Currency is required."); return; }
    if (!period) { setError("Period is required."); return; }
    if (!periodValue) { setError("Period value is required."); return; }
    if (!dueDate) { setError("Due date is required."); return; }
    if (!expectedCloseDate) { setError("Expected closing date is required."); return; }
    if (!ownerId) { setError("Assignee is required."); return; }
    if (!followUpDate) { setError("Follow up date is required."); return; }
    if (!source) { setError("Source is required."); return; }
    if (!tags.trim()) { setError("Tags are required."); return; }
    if (!priority) { setError("Priority is required."); return; }
    if (!description.trim() || description === "<p></p>") { setError("Description is required."); return; }
    setError(null);
    setSaving(true);
    try {
      const contact = contacts.find((c) => c.id === contactId);
      const opp = await createOpportunityFromAccount({
        accountId,
        contactId: contactId || null,
        name: name.trim(),
        company: accountName,
        contactName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
        contactEmail: contact?.email ?? null,
        dealValue: Number(dealValue) || 0,
        stage: STATUS_TO_STAGE[status],
        pipeline: pipeline || null,
        currency,
        period,
        periodValue: periodValue ? Number(periodValue) : null,
        dueDate: dueDate || null,
        expectedCloseDate: expectedCloseDate || null,
        ownerId: ownerId || null,
        followUpDate: followUpDate || null,
        source: source || null,
        tags: tags.trim() || null,
        priority,
        projects: projects.length ? projects.join(", ") : null,
        notes: description || null,
      });
      toast("Deal created.", "success");
      onClose();
      router.push(`/opportunities/${opp.id}`);
    } catch {
      toast("Couldn't create deal. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Add New Deal</h2>
            <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {error && <p className="sm:col-span-2 text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}

            <Field label="Deal Name" required className="sm:col-span-2">
              <input className={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field label="Pipeline" required>
              <select className={fieldStyle} value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
                <option value="">Choose</option>
                {PIPELINES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status" required>
              <select className={fieldStyle} value={status} onChange={(e) => setStatus(e.target.value as DealStatus)}>
                <option value="">Choose</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Deal Value" required>
              <input type="number" min={0} placeholder="0" className={fieldStyle} value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
            </Field>
            <Field label="Currency" required>
              <select className={fieldStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">Choose</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="Period" required>
              <select className={fieldStyle} value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="">Choose</option>
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Period Value" required>
              <input type="number" min={0} placeholder="0" className={fieldStyle} value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} />
            </Field>

            <Field label="Account" required className="sm:col-span-2">
              <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] px-2.5 py-1.5">
                <Chip name={accountName} />
              </div>
            </Field>

            <Field label="Contact" className="sm:col-span-2">
              {contactId ? (
                <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5">
                  <Chip name={contacts.find((c) => c.id === contactId) ? `${contacts.find((c) => c.id === contactId)!.first_name} ${contacts.find((c) => c.id === contactId)!.last_name}`.trim() : "Unknown"} onRemove={() => setContactId("")} />
                </div>
              ) : (
                <select className={fieldStyle} value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={contacts.length === 0}>
                  <option value="">{contacts.length === 0 ? "No contacts linked to this account" : "None"}</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()}</option>)}
                </select>
              )}
            </Field>

            <Field label="Project" className="sm:col-span-2">
              <div className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 focus-within:ring-1 focus-within:ring-[var(--primary)]/35 focus-within:border-[var(--primary)]">
                {projects.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 text-[11px] font-medium pl-2 pr-1 py-0.5">
                    {p}
                    <button type="button" onClick={() => setProjects((cur) => cur.filter((x) => x !== p))} className="hover:text-teal-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="flex-1 min-w-[100px] text-sm outline-none py-0.5 bg-transparent dark:text-white"
                  value={projectInput}
                  onChange={(e) => setProjectInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitProject(); } }}
                  onBlur={commitProject}
                  placeholder={projects.length ? "" : "Type a project name and press Enter…"}
                />
              </div>
            </Field>

            <Field label="Due Date" required>
              <input type="date" className={fieldStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Expected Closing Date" required>
              <input type="date" className={fieldStyle} value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
            </Field>

            <Field label="Assignee" required className="sm:col-span-2">
              {ownerId ? (
                <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5">
                  <Chip name={owners.find((o) => o.id === ownerId)?.name || "Unknown"} onRemove={() => setOwnerId("")} />
                </div>
              ) : (
                <select className={fieldStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Choose</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </Field>

            <Field label="Follow Up Date" required>
              <input type="date" className={fieldStyle} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </Field>
            <Field label="Source" required>
              <select className={fieldStyle} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Select…</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Tags" required>
              <input className={fieldStyle} placeholder="Collab, Rated" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Priority" required>
              <select className={fieldStyle} value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
                <option value="">Select</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>

            <Field label="Description" required className="sm:col-span-2">
              <RichTextEditor value={description} onChange={setDescription} toolbar="compact" minHeight={100} />
            </Field>
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-900">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white">
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
