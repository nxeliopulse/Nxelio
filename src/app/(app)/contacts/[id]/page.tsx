import { notFound } from "next/navigation";
import { getContactById, getContactsCount } from "@/lib/queries/contacts";
import { getUsers } from "@/lib/queries/users";
import { getContactNotes } from "@/lib/queries/contact-notes";
import { getMeetingsForContact } from "@/lib/queries/meetings";
import { getContactTasks } from "@/lib/queries/contact-tasks";
import { getContactCalls } from "@/lib/queries/contact-calls";
import { getContactDocuments } from "@/lib/queries/contact-documents";
import { getContactEmails } from "@/lib/queries/contact-emails";
import { hasConnectedMailbox } from "@/lib/queries/outreach-accounts";
import { getOpportunitiesForContact } from "@/lib/queries/opportunities";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, users, totalCount] = await Promise.all([getContactById(id), getUsers(), getContactsCount()]);
  if (!contact) notFound();
  const [notes, meetings, tasks, calls, documents, emails, mailboxConnected, deals] = await Promise.all([
    getContactNotes(contact.id),
    getMeetingsForContact(contact.id),
    getContactTasks(contact.id),
    getContactCalls(contact.id),
    getContactDocuments(contact.id),
    getContactEmails(contact.id),
    hasConnectedMailbox(),
    getOpportunitiesForContact(contact.id),
  ]);
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return (
    <ContactDetailView
      contact={contact}
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
