import { getAccounts } from "@/lib/queries/accounts";
import { AccountsTable } from "@/components/accounts/accounts-table";

export default async function AccountsPage() {
  const accounts = await getAccounts();
  return <AccountsTable accounts={accounts} />;
}
