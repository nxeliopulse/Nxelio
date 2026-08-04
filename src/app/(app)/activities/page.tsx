import { createClient } from "@/lib/supabase/server";
import { getMeetings } from "@/lib/queries/meetings";
import { ActivitiesDashboardView, type DbActivityRow } from "@/components/activities/activities-dashboard-view";

async function getActivities(): Promise<DbActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select(`
      id,
      activity_type,
      created_at,
      metadata,
      lead:leads (
        id,
        full_name,
        company_name,
        email
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getActivities] failed:", error.message);
    return [];
  }
  return (data || []) as unknown as DbActivityRow[];
}

export default async function ActivitiesPage() {
  const [activities, meetings] = await Promise.all([
    getActivities(),
    getMeetings(),
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
    <ActivitiesDashboardView
      dbActivities={activities}
      dbMeetings={meetings}
      currentUserName={currentUserName}
    />
  );
}
