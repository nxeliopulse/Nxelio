import { LayoutDashboard, Users2, Send, Layers3, Briefcase, BarChart3, Newspaper, UserCog, Settings, Link2, CalendarDays, CreditCard, Building2, Contact } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "Super Admin" | "Sales Admin" | "Marketing Admin" | string;

export interface SubNavItem {
  label: string;
  href: string;
  roles?: Role[];
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which roles can see this nav item */
  roles: Role[];
  items?: SubNavItem[];
}

const ALL: Role[] = ["Super Admin", "Sales Admin", "Marketing Admin"];
const SALES: Role[] = ["Super Admin", "Sales Admin"];
const MARKETING: Role[] = ["Super Admin", "Marketing Admin"];
const SUPER: Role[] = ["Super Admin"];

/**
 * Ordered by day-to-day priority (the Instantly/Apollo daily loop):
 * Dashboard → Leads → Campaigns (now includes Sequences/Outreach) → Segments
 * (build the audience right after building the campaign), then supporting
 * tools (Opportunities, Meetings, Newsletters), measurement last (Analytics).
 * The old Outreach tab is merged into Campaigns. Inbox is no longer a
 * standalone nav item — replies are viewed per-campaign, on that campaign's
 * own "Inbox" tab (see CampaignDetailView).
 */
export const navMainItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ALL },
  { label: "Prospects", href: "/leads", icon: Users2, roles: SALES },
  { label: "Accounts", href: "/accounts", icon: Building2, roles: SALES },
  { label: "Contacts", href: "/contacts", icon: Contact, roles: SALES },
  { label: "Campaigns", href: "/campaigns", icon: Send, roles: SALES },
  { label: "Segments", href: "/segments", icon: Layers3, roles: MARKETING },
  { label: "Opportunities", href: "/opportunities", icon: Briefcase, roles: SALES },
  {
    label: "Activities",
    href: "/meetings",
    icon: CalendarDays,
    roles: SALES,
    items: [
      { label: "Meetings", href: "/meetings" },
      { label: "Emails", href: "/activities/emails" },
    ],
  },
  { label: "Newsletters", href: "/newsletters", icon: Newspaper, roles: MARKETING },
  { label: "Analytics", href: "/analytics", icon: BarChart3, roles: ALL },
];

export const navAdminItems: NavItem[] = [
  { label: "Administration", href: "/users", icon: UserCog, roles: SUPER },
  { label: "Subscription", href: "/billing", icon: CreditCard, roles: SUPER },
  { label: "Capture Form", href: "/capture-form", icon: Link2, roles: SUPER },
  { label: "Settings", href: "/settings", icon: Settings, roles: ALL },
];

/** Admin nav entries actually rendered in the sidebar. "Settings" stays in
 *  navAdminItems (permission checks — e.g. the per-user nav-access toggle
 *  list — still key off it) but is reached from the topbar profile menu
 *  instead of the sidebar, so it's excluded from the rendered list.
 *  "Subscription" (/billing) is excluded the same way — it's already reachable
 *  via the topbar Upgrade button and the sidebar's AI Credits widget, so it
 *  stays in navAdminItems purely so isNavItemAllowed() and the per-user
 *  nav-access toggle list (User Management) can resolve it correctly. */
export const sidebarAdminItems: NavItem[] = navAdminItems.filter((i) => i.href !== "/settings" && i.href !== "/billing");

export function filterNavByRole(items: NavItem[], role: Role | null | undefined): NavItem[] {
  if (!role) return items;
  return items.filter((i) => i.roles.includes(role));
}

/**
 * Apply per-user overrides on top of role defaults.
 * - If navAccess[item.href] === true, item is allowed (even if role doesn't normally allow it)
 * - If navAccess[item.href] === false, item is denied (even if role allows it)
 * - If navAccess has no key, falls back to role default
 */
/** Whether a single nav item (by href) is allowed for this role, honoring per-user overrides. */
export function isNavItemAllowed(
  items: NavItem[],
  href: string,
  role: Role | null | undefined,
  navAccess?: Record<string, boolean> | null
): boolean {
  const item = items.find((i) => i.href === href);
  if (!item) return false;
  const override = navAccess && Object.prototype.hasOwnProperty.call(navAccess, href) ? navAccess[href] : undefined;
  if (override === true) return true;
  if (override === false) return false;
  return !role || item.roles.includes(role);
}

export function filterNavByRoleAndOverrides(
  items: NavItem[],
  role: Role | null | undefined,
  navAccess?: Record<string, boolean> | null
): NavItem[] {
  return items.filter((i) => {
    const override = navAccess && Object.prototype.hasOwnProperty.call(navAccess, i.href)
      ? navAccess[i.href]
      : undefined;
    if (override === true) return true;
    if (override === false) return false;
    return !role || i.roles.includes(role);
  });
}
