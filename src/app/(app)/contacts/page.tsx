import { getContacts } from "@/lib/queries/contacts";
import { getUsers } from "@/lib/queries/users";
import { ContactsTable } from "@/components/contacts/contacts-table";

export default async function ContactsPage() {
  const [contacts, users] = await Promise.all([getContacts(), getUsers()]);
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return <ContactsTable contacts={contacts} owners={owners} />;
}
