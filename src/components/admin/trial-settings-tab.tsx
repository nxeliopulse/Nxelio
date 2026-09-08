"use client";
import { useState } from "react";
import { Hourglass, Info, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setTrialDays } from "@/lib/queries/trial-settings";
import {
  TRIAL_DAYS_MIN,
  TRIAL_DAYS_MAX,
  TRIAL_USER_LIMIT,
  validateTrialDays,
} from "@/lib/trial-rules";

export function TrialSettingsTab({ initialTrialDays }: { initialTrialDays: number }) {
  // Held as a string so the field can be empty mid-edit without snapping to 0.
  const [value, setValue] = useState(String(initialTrialDays));
  const [saved, setSaved] = useState(initialTrialDays);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Validated on every keystroke with the same function the server action
  // uses, so the message the admin sees while typing is the message they'd
  // get on save.
  const liveCheck = validateTrialDays(value);
  const dirty = liveCheck.ok && liveCheck.value !== saved;

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (!liveCheck.ok) {
      setError(liveCheck.error!);
      return;
    }
    setPending(true);
    try {
      const res = await setTrialDays(liveCheck.value);
      if (!res.ok) {
        setError(res.error || "Couldn't save the trial period.");
        return;
      }
      setSaved(res.trialDays!);
      setValue(String(res.trialDays!));
      setSuccess(`Saved. New signups now get a ${res.trialDays}-day trial.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
            <Hourglass className="h-5 w-5 text-cyan-500" /> Trial Period
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            How long a new account can evaluate Nxelio Nurture before it needs a
            subscription. Applies to new signups only — anyone already in a trial keeps
            the end date they were given.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Input
                type="number"
                inputMode="numeric"
                min={TRIAL_DAYS_MIN}
                max={TRIAL_DAYS_MAX}
                step={1}
                label="Trial period (days)"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                // `error` on Input is a boolean border state, not a message —
                // the text renders below so the admin sees the reason too.
                error={value !== "" && !liveCheck.ok}
                aria-invalid={value !== "" && !liveCheck.ok}
                aria-describedby="trial-days-hint"
              />
            </div>
            <Button onClick={handleSave} disabled={pending || !dirty}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>

          {value !== "" && !liveCheck.ok ? (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" id="trial-days-hint">
              {liveCheck.error}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-500" id="trial-days-hint">
              Allowed range: {TRIAL_DAYS_MIN}–{TRIAL_DAYS_MAX} days. Currently saved:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {saved} days
              </span>
              .
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
            <Info className="h-5 w-5 text-slate-400" /> Trial user limit
          </h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Trial accounts are capped at{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {TRIAL_USER_LIMIT} users
            </span>
            , counting the person who created the account. The cap lifts the moment the
            account converts to a paid plan. This limit is fixed and not configurable.
          </p>
        </div>
      </div>
    </div>
  );
}
