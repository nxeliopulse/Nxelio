import { getInboxConversations } from "@/lib/queries/inbox";
import { InboxView } from "@/components/inbox/inbox-view";

export default async function InboxPage() {
  const conversations = await getInboxConversations();
  return <InboxView conversations={conversations} />;
}
