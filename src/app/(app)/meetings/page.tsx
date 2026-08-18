import { getMeetings } from "@/lib/queries/meetings";
import { getLeads } from "@/lib/queries/leads";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { hasFeature } from "@/lib/queries/subscriptions";
import { LockedFeature } from "@/components/billing/locked-feature";
import { createClient } from "@/lib/supabase/server";

export default async function MeetingsPage() {
  if (!(await hasFeature("meetings"))) return <LockedFeature feature="Meetings" />;
  const [meetings, leads] = await Promise.all([getMeetings(), getLeads()]);
  const leadOptions = leads.map((l) => ({
    id: l.id,
    full_name: l.full_name,
    company_name: l.company_name,
    email: l.email,
  }));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <MeetingsView meetings={meetings} leads={leadOptions} userEmail={user?.email || ""} />;
}
