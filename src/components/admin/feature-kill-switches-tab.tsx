"use client";
import { useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setFeatureKillSwitch, type KillSwitchFeature } from "@/lib/queries/feature-kill-switches";
import { ConfirmPasswordModal } from "@/components/admin/confirm-password-modal";

const FEATURES: { key: KillSwitchFeature; label: string; description: string }[] = [
  {
    key: "launch_campaign",
    label: "Launch Campaign",
    description: "Starting a new campaign send, and any already-running sequence's follow-up steps.",
  },
  {
    key: "send_email",
    label: "Send Email",
    description: "One-off emails from Leads, Contacts, Accounts, and Activities → Emails compose/reply.",
  },
  {
    key: "send_newsletter",
    label: "Send Newsletter",
    description: "Sending a newsletter to its recipient list, including test sends.",
  },
];

export function FeatureKillSwitchesTab({ initialSwitches }: { initialSwitches: Record<KillSwitchFeature, boolean> }) {
  const [switches, setSwitches] = useState(initialSwitches);
  const [pendingToggle, setPendingToggle] = useState<{ feature: KillSwitchFeature; next: boolean } | null>(null);

  async function confirmToggle(password: string): Promise<{ ok: boolean; error?: string }> {
    if (!pendingToggle) return { ok: false, error: "Nothing to confirm." };
    const res = await setFeatureKillSwitch(pendingToggle.feature, pendingToggle.next, password);
    if (res.ok) {
      setSwitches((s) => ({ ...s, [pendingToggle.feature]: pendingToggle.next }));
      setPendingToggle(null);
    }
    return res;
  }

  const pendingLabel = pendingToggle ? FEATURES.find((f) => f.key === pendingToggle.feature)?.label : "";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-rose-500" /> Feature Access
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Platform-wide kill switches — turning one off locks it for every workspace immediately, for every user except you. Every change needs your password to confirm.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {FEATURES.map((f) => (
            <div key={f.key} className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  {!switches[f.key] && <Lock className="h-3.5 w-3.5 text-rose-500" />}
                  {f.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{f.description}</p>
              </div>
              <Switch
                checked={switches[f.key]}
                onChange={(next) => setPendingToggle({ feature: f.key, next })}
                aria-label={`Toggle ${f.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <ConfirmPasswordModal
        open={pendingToggle !== null}
        onClose={() => setPendingToggle(null)}
        onConfirm={confirmToggle}
        title={pendingToggle ? `${pendingToggle.next ? "Enable" : "Disable"} ${pendingLabel}?` : ""}
        description="Enter your admin password to confirm this change."
      />
    </div>
  );
}
