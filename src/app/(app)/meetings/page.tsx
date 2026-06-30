import { getMeetings } from "@/lib/queries/meetings";
import { getLeads } from "@/lib/queries/leads";
import { MeetingsView } from "@/components/meetings/meetings-view";

export default async function MeetingsPage() {
  const [meetings, leads] = await Promise.all([getMeetings(), getLeads()]);
  const leadOptions = leads.map((l) => ({
    id: l.id,
    full_name: l.full_name,
    company_name: l.company_name,
    email: l.email,
  }));
  return <MeetingsView meetings={meetings} leads={leadOptions} />;
}
