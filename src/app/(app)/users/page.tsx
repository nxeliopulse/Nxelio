import { redirect } from "next/navigation";
import { getUsers, getRoles, getCurrentUserProfile } from "@/lib/queries/users";
import { getPicklistCategories } from "@/lib/queries/picklists";
import { AdministrationView } from "@/components/administration/administration-view";

export default async function UsersPage() {
  const [users, roles, profile] = await Promise.all([
    getUsers(),
    getRoles(),
    getCurrentUserProfile(),
  ]);
  const p = profile as { user_id?: string; role_id?: number | null; roles?: { role_name?: string } | null } | null;
  const roleName = p?.roles?.role_name;
  const isAdmin = roleName === "Super Admin" || p?.role_id === 1;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const picklistCategories = await getPicklistCategories().catch(() => []);

  return (
    <AdministrationView
      users={users}
      roles={roles}
      isAdmin={isAdmin}
      currentUserId={p?.user_id ?? null}
      picklistCategories={picklistCategories}
    />
  );
}
