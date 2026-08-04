import type { TourStep } from "./tour-types";

/** Bump a page's version here to make its tour auto-show once more for
 *  users who already completed/skipped an earlier version. */
export const CURRENT_VERSIONS: Record<string, string> = {
  dashboard: "1",
  leads: "1",
  campaigns: "1",
};

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard-welcome",
    title: "Welcome to Nxelio",
    description: "This is your home base. Here's a quick tour of what's next.",
  },
  {
    id: "dashboard-revenue-chart",
    title: "Revenue analytics",
    description: "Track revenue and pipeline here once you start closing deals.",
  },
  {
    id: "dashboard-sidebar-nav",
    title: "Everything else lives here",
    description: "Prospects, Campaigns, Opportunities, and more — all one click away in the sidebar.",
    placement: "right",
  },
];

export const LEADS_TOUR_STEPS: TourStep[] = [
  {
    id: "leads-title",
    title: "Prospects",
    description: "Every lead you add, import, or discover lives here.",
  },
  {
    id: "leads-add-prospect",
    title: "Add a prospect",
    description: "Add prospects manually, import a CSV, or discover new ones.",
  },
  {
    id: "leads-filter",
    title: "Filter your list",
    description: "Narrow the list down by status, score, source, and more.",
  },
  {
    id: "leads-stats",
    title: "Live stats",
    description: "These update automatically as your pipeline grows.",
  },
];

export const CAMPAIGNS_TOUR_STEPS: TourStep[] = [
  {
    id: "campaigns-title",
    title: "Campaigns",
    description: "Build and track outreach sequences to your prospects.",
  },
  {
    id: "campaigns-new",
    title: "Create a campaign",
    description: "Build a multi-step outreach sequence across email and LinkedIn.",
  },
  {
    id: "campaigns-filter",
    title: "Search and filter",
    description: "Search by name, show active-only campaigns, or filter by approval stage.",
  },
  {
    id: "campaigns-list",
    title: "Track performance",
    description: "Sent, open, and reply rates show up here per campaign.",
  },
];
