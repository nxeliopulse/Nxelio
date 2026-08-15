import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type LeadProviderName = "anysite" | "bright_data";

/** Reads which data source Buy Leads uses right now, from the platform-wide
 *  setting (Super Admin panel). Defaults to Bright Data if unset — the
 *  original, always-on behavior — so this table being empty never silently
 *  changes what the app does. */
export async function getActiveLeadProvider(): Promise<LeadProviderName> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("lead_provider_settings").select("active_provider").eq("id", 1).maybeSingle();
    return data?.active_provider === "anysite" ? "anysite" : "bright_data";
  } catch {
    return "bright_data";
  }
}
