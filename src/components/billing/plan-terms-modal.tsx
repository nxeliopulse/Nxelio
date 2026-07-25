"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  planName: string;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

/**
 * Gate shown before any checkout is initiated (new subscription or upgrade).
 * The user must tick the checkbox before "Continue to Payment" is enabled —
 * dismissing/closing this modal never starts checkout.
 */
export function PlanTermsModal({ open, planName, onClose, onConfirm, confirming }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset the checkbox each time the modal transitions from closed to open
  // (e.g. reopened for a different plan) — adjusted during render per React's
  // guidance, not in an effect, to avoid an extra cascading render.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setAgreed(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Subscription Terms — ${planName}`} description="Please review before continuing to payment" size="md">
      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 max-h-80 overflow-y-auto text-sm text-slate-700 space-y-3">
          <div>
            <p className="font-semibold text-slate-900">Billing &amp; auto-renewal</p>
            <p className="text-slate-600">Your subscription renews automatically each billing cycle (monthly or annual) until canceled. Your card on file will be charged automatically at each renewal.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">No refunds</p>
            <p className="text-slate-600">All charges are final. We do not issue refunds for partial months, unused AI credits or leads, or early cancellation.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">No downgrades</p>
            <p className="text-slate-600">Once subscribed, moving to a lower-tier plan isn&apos;t available through self-service. Contact support if you need to move to a lower plan.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Upgrades</p>
            <p className="text-slate-600">Upgrades take effect immediately and are prorated — you&apos;re only charged the difference for the remainder of your current billing period.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Free trial (Basic, monthly billing only)</p>
            <p className="text-slate-600">A card is required to start the trial. You won&apos;t be charged until day 7, and can cancel anytime before then at no cost.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Credits &amp; leads</p>
            <p className="text-slate-600">Your monthly AI credit and lead allowances reset every billing cycle — unused amounts don&apos;t roll over. Purchased Lead Top-Ups are the exception: they never expire on the monthly reset, only when used.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Lead Top-Ups</p>
            <p className="text-slate-600">A one-time, non-refundable purchase, limited to one per calendar month.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Promo codes</p>
            <p className="text-slate-600">Each promo code may be redeemed at most once per workspace and is subject to its own terms shown at the time of redemption.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Cancellation</p>
            <p className="text-slate-600">You can cancel anytime from your billing dashboard. Your access continues until the end of your current billing period — no partial refund is issued.</p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 shrink-0"
          />
          <span className="text-sm text-slate-700">
            I have read and agree to the Subscription Terms &amp; Conditions above — including the no-refund and no-downgrade policy.
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!agreed || confirming}>
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
