import { getContacts } from "@/lib/queries/contacts";
import { ContactsTable } from "@/components/contacts/contacts-table";

export default async function ContactsPage() {
  const contacts = await getContacts();
  return <ContactsTable contacts={contacts} />;
}
