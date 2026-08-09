"use client";
import { useEffect, useState } from "react";
import { getCampaignsForLead } from "@/lib/queries/campaigns";

/**
 * True once this lead is confirmed to be part of a currently Active
 * campaign — used to lock manual Status edits so someone can't contradict
 * what a live send sequence is doing to that lead mid-flight.
 */
export function useLeadInActiveCampaign(leadId: string): boolean {
  const [inActive, setInActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setInActive(false);
    getCampaignsForLead(leadId)
      .then((campaigns) => { if (!cancelled) setInActive(campaigns.some((c) => c.status === "Active")); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leadId]);
  return inActive;
}
