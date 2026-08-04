import { notFound } from "next/navigation";
import { getContactById } from "@/lib/queries/contacts";
import { getUsers } from "@/lib/queries/users";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, users] = await Promise.all([getContactById(id), getUsers()]);
  if (!contact) notFound();
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name, role: u.role_name }));
  return <ContactDetailView contact={contact} owners={owners} />;
}
