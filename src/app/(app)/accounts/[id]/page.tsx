import { notFound } from "next/navigation";
import { getAccountById, getAccountContacts } from "@/lib/queries/accounts";
import { getUsers } from "@/lib/queries/users";
import { AccountDetailView } from "@/components/accounts/account-detail-view";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, contacts, users] = await Promise.all([getAccountById(id), getAccountContacts(id), getUsers()]);
  if (!account) notFound();
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return <AccountDetailView account={account} contacts={contacts} owners={owners} />;
}
