"use server";
import { hasFeature, getMaxBuyLeadsCount } from "@/lib/queries/subscriptions";
import { isFeatureEnabledForCurrentUser } from "@/lib/queries/feature-kill-switches";
import { listLeadSearchJobs, getLeadSearchJob, type LeadSearchJobDetail } from "@/lib/leads/lead-search-jobs";

export interface BuyLeadsWizardBootstrap {
  discoveryEnabled: boolean;
  verifiedEmailsReleased: boolean;
  companyWiseLeadsEnabled: boolean;
  maxBuyCount: number;
  /** The workspace's currently running/queued background search, if any —
   *  null once nothing is active. */
  activeJob: LeadSearchJobDetail | null;
}

/**
 * Everything Add Leads Wizard needs on open, in ONE round trip. This used to
 * be 5 separate "use server" calls fired from two different useEffects —
 * each one is its own client<->server Server Action request, and despite
 * every individual query being fast, paying that request overhead five times
 * made opening Buy Leads visibly slow (several seconds) before the form
 * appeared. Collapsing them into a single Promise.all here cuts that to one
 * request.
 */
export async function getBuyLeadsWizardBootstrap(): Promise<BuyLeadsWizardBootstrap> {
  const [discoveryEnabled, verifiedEmailsReleased, companyWiseLeadsEnabled, maxBuyCount, jobs] = await Promise.all([
    hasFeature("discovery").catch(() => false),
    isFeatureEnabledForCurrentUser("verified_emails_source").catch(() => false),
    isFeatureEnabledForCurrentUser("company_wise_leads").catch(() => false),
    getMaxBuyLeadsCount().catch(() => 100),
    listLeadSearchJobs().catch(() => []),
  ]);

  const activeSummary = jobs.find((j) => j.status === "pending" || j.status === "running");
  const activeJob = activeSummary ? await getLeadSearchJob(activeSummary.id).catch(() => null) : null;

  return { discoveryEnabled, verifiedEmailsReleased, companyWiseLeadsEnabled, maxBuyCount, activeJob };
}
