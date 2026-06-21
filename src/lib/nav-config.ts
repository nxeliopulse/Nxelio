import { LayoutDashboard, Users2, Send, Layers3, BarChart3, Inbox, Newspaper, UserCog, Settings, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "Super Admin" | "Sales Admin" | "Marketing Admin" | string;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which roles can see this nav item */
  roles: Role[];
}

const ALL: Role[] = ["Super Admin", "Sales Admin", "Marketing Admin"];
const SALES: Role[] = ["Super Admin", "Sales Admin"];
const MARKETING: Role[] = ["Super Admin", "Marketing Admin"];
const SUPER: Role[] = ["Super Admin"];

/**
 * Ordered by day-to-day priority (the Instantly/Apollo daily loop):
 * Dashboard → Leads → Campaigns (now includes Sequences/Outreach) → Inbox,
 * then supporting tools (Segments, Newsletters, Templates, Workflows),
 * measurement last (Analytics). The old Outreach tab is merged into Campaigns.
 */
export const navMainItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ALL },
  { label: "Leads", href: "/leads", icon: Users2, roles: SALES },
  { label: "Campaigns", href: "/campaigns", icon: Send, roles: SALES },
  { label: "Inbox", href: "/inbox", icon: Inbox, roles: SALES },
  { label: "Segments", href: "/segments", icon: Layers3, roles: MARKETING },
  { label: "Newsletters", href: "/newsletters", icon: Newspaper, roles: MARKETING },
  { label: "Analytics", href: "/analytics", icon: BarChart3, roles: ALL },
];

export const navAdminItems: NavItem[] = [
  { label: "User Management", href: "/users", icon: UserCog, roles: SUPER },
  { label: "Capture Form", href: "/capture-form", icon: Link2, roles: SUPER },
  { label: "Settings", href: "/settings", icon: Settings, roles: ALL },
];

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
