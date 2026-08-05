import { notFound } from "next/navigation";
import { getAccountById, getAccountContacts, getAccountsCount } from "@/lib/queries/accounts";
import { getUsers } from "@/lib/queries/users";
import { getAccountNotes } from "@/lib/queries/account-notes";
import { getMeetingsForAccount } from "@/lib/queries/meetings";
import { getAccountTasks } from "@/lib/queries/account-tasks";
import { getAccountCalls } from "@/lib/queries/account-calls";
import { getAccountDocuments } from "@/lib/queries/account-documents";
import { getAccountEmails } from "@/lib/queries/account-emails";
import { hasConnectedMailbox } from "@/lib/queries/outreach-accounts";
import { getOpportunitiesForAccount } from "@/lib/queries/opportunities";
import { AccountDetailView } from "@/components/accounts/account-detail-view";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, contacts, users, totalCount] = await Promise.all([getAccountById(id), getAccountContacts(id), getUsers(), getAccountsCount()]);
  if (!account) notFound();
  const [notes, meetings, tasks, calls, documents, emails, mailboxConnected, deals] = await Promise.all([
    getAccountNotes(account.id),
    getMeetingsForAccount(account.id),
    getAccountTasks(account.id),
    getAccountCalls(account.id),
    getAccountDocuments(account.id),
    getAccountEmails(account.id),
    hasConnectedMailbox(),
    getOpportunitiesForAccount(account.id),
  ]);
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return (
    <AccountDetailView
      account={account}
      contacts={contacts}
      owners={owners}
      notes={notes}
      meetings={meetings}
      tasks={tasks}
      calls={calls}
      documents={documents}
      emails={emails}
      mailboxConnected={mailboxConnected}
      deals={deals}
      totalCount={totalCount}
    />
  );
}
