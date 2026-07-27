import { notFound } from "next/navigation";
import { getContactById } from "@/lib/queries/contacts";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();
  return <ContactDetailView contact={contact} />;
}
