"use client";
import { useState } from "react";
import { Users2, ListChecks, Sliders } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { UsersView } from "@/components/users/users-view";
import { PicklistsManager } from "@/components/administration/picklists-manager";
import { CustomFieldsBuilder } from "@/components/administration/custom-fields-builder";
import type { UserWithRole } from "@/lib/queries/users";
import type { PicklistCategoryRow } from "@/lib/picklists";

const TABS = [
  { id: "users", label: "User Management", icon: <Users2 className="h-4 w-4" /> },
  { id: "picklists", label: "Picklists", icon: <ListChecks className="h-4 w-4" /> },
  { id: "custom-fields", label: "Custom Fields", icon: <Sliders className="h-4 w-4" /> },
] as const;

interface Props {
  users: UserWithRole[];
  roles: { role_id: number; role_name: string; role_description?: string | null }[];
  isAdmin: boolean;
  currentUserId: string | null;
  picklistCategories: PicklistCategoryRow[];
}

export function AdministrationView({ users, roles, isAdmin, currentUserId, picklistCategories }: Props) {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("users");

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader title="Administration" description="Manage your team, object schemas, custom fields, and platform picklists." />

      <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {active === "users" && <UsersView users={users} roles={roles} isAdmin={isAdmin} currentUserId={currentUserId} />}
      {active === "picklists" && <PicklistsManager categories={picklistCategories} />}
      {active === "custom-fields" && <CustomFieldsBuilder />}
    </div>
  );
}
