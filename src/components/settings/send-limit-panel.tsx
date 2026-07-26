"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import { useFeedback } from "@/components/ui/feedback";
import { setSendLimit, clearSendLimit, type SendLimitRow, type SendChannel } from "@/lib/queries/outreach-send-limits";

/** Slider scale per channel — LinkedIn actions realistically top out far lower than email sends. */
const TRACK_MAX: Record<SendChannel, number> = { linkedin: 50, email: 200 };
const TICKS: Record<SendChannel, number[]> = {
  linkedin: [0, 10, 20, 30, 40, 50],
  email: [0, 50, 100, 150, 200],
};

/**
 * Daily sending-limit toggle + min/max range for one channel. No row saved →
 * unthrottled (today's default). Enforced server-side in campaign-send.ts /
 * campaign-scheduler.ts — this panel only edits the configured range.
 */
export function SendLimitPanel({
  channel,
  initial,
  label,
}: {
  channel: SendChannel;
  initial: SendLimitRow | null;
  label: string;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [min, setMin] = useState(initial?.daily_min ?? 15);
  const [max, setMax] = useState(initial?.daily_max ?? 25);

  function save() {
    start(async () => {
      if (!enabled) {
        const res = await clearSendLimit(channel);
        if (!res.ok) { toast(res.error || "Couldn't update the limit.", "error"); return; }
        toast("Daily limit removed — sending is unthrottled.", "success");
      } else {
        if (max < min) { toast("Max per day must be at least the min.", "error"); return; }
        const res = await setSendLimit(channel, min, max);
        if (!res.ok) { toast(res.error || "Couldn't save the limit.", "error"); return; }
        toast("Daily sending limit saved.", "success");
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-5 pt-5 border-t border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900 text-sm">Daily sending limit</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Caps how many {label} go out per day, then automatically continues the next day — helps avoid provider spam/rate-limit flags.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Enable daily sending limit"
          onClick={() => setEnabled((v) => !v)}
          className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-blue-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-4">
          <DualRangeSlider
            min={min}
            max={max}
            trackMin={0}
            trackMax={TRACK_MAX[channel]}
            ticks={TICKS[channel]}
            onChange={(newMin, newMax) => { setMin(newMin); setMax(newMax); }}
          />
          <Button variant="outline" onClick={save} disabled={pending} className="mt-3">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      )}
      {!enabled && Boolean(initial) && (
        <div className="mt-3">
          <Button variant="outline" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove limit"}
          </Button>
        </div>
      )}
    </div>
  );
}
