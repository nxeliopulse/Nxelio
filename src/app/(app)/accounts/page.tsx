import { getAccounts } from "@/lib/queries/accounts";
import { getUsers } from "@/lib/queries/users";
import { AccountsTable } from "@/components/accounts/accounts-table";

export default async function AccountsPage() {
  const [accounts, users] = await Promise.all([getAccounts(), getUsers()]);
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return <AccountsTable accounts={accounts} owners={owners} />;
}
