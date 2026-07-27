import { notFound } from "next/navigation";
import { getAccountById, getAccountContacts } from "@/lib/queries/accounts";
import { AccountDetailView } from "@/components/accounts/account-detail-view";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, contacts] = await Promise.all([getAccountById(id), getAccountContacts(id)]);
  if (!account) notFound();
  return <AccountDetailView account={account} contacts={contacts} />;
}
