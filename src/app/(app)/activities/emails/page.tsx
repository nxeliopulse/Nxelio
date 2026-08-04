import { createClient } from "@/lib/supabase/server";
import { getInboxConversations, getSentMessages } from "@/lib/queries/inbox";
import { EmailsView } from "@/components/activities/emails-view";

export default async function EmailActivitiesPage() {
  const [inbox, sent] = await Promise.all([
    getInboxConversations(),
    getSentMessages(),
  ]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("user_id", user?.id)
    .single();
  const currentUserName = profile?.full_name || "User";

  return (
    <EmailsView
      inbox={inbox}
      sent={sent}
      currentUserName={currentUserName}
    />
  );
}
