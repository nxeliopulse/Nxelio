export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  href: string;
  /** If set, the destination page force-starts this tour on arrival. */
  tourPageKey?: string;
}

/**
 * Assembles the Dashboard's "Getting Started" checklist from data the caller
 * already has on hand — no new queries beyond what's passed in. Every item
 * except "take the product tour" is derived live from real data (matching
 * getOnboardingStatus()'s existing convention of computing status rather
 * than storing a redundant boolean).
 */
export function buildGettingStartedItems(input: {
  totalLeads: number;
  inboxConnected: boolean;
  campaignsSent: number;
  opportunitiesCount: number;
  activeTeammates: number;
  tourTaken: boolean;
}): ChecklistItem[] {
  return [
    {
      id: "add-prospect",
      label: "Add your first prospect",
      done: input.totalLeads > 0,
      href: "/leads",
      tourPageKey: "leads",
    },
    {
      id: "connect-inbox",
      label: "Connect your inbox",
      done: input.inboxConnected,
      href: "/settings",
    },
    {
      id: "launch-campaign",
      label: "Launch a campaign",
      done: input.campaignsSent > 0,
      href: "/campaigns",
      tourPageKey: "campaigns",
    },
    {
      id: "create-opportunity",
      label: "Create an opportunity",
      done: input.opportunitiesCount > 0,
      href: "/opportunities",
    },
    {
      id: "invite-team",
      label: "Invite your team",
      done: input.activeTeammates > 1,
      href: "/users",
    },
    {
      id: "take-tour",
      label: "Take the product tour",
      done: input.tourTaken,
      href: "/dashboard",
      tourPageKey: "dashboard",
    },
  ];
}
