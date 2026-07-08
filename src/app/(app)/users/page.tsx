import { getUsers, getRoles, getCurrentUserProfile } from "@/lib/queries/users";
import { UsersView } from "@/components/users/users-view";

export default async function UsersPage() {
  const [users, roles, profile] = await Promise.all([
    getUsers(),
    getRoles(),
    getCurrentUserProfile(),
  ]);
  const p = profile as { user_id?: string; role_id?: number | null; roles?: { role_name?: string } | null } | null;
  const roleName = p?.roles?.role_name;
  const isAdmin = roleName === "Super Admin" || p?.role_id === 1;
  return (
    <UsersView
      users={users}
      roles={roles}
      isAdmin={isAdmin}
      currentUserId={p?.user_id ?? null}
    />
  );
}
