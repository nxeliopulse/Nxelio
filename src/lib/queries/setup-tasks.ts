"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Per-workspace state for the dashboard's "Finish setting up your workspace"
 * checklist.
 *
 * Stored in the existing `ai_recommendations` table (migration 0130) rather
 * than a new one: that table already models exactly this — one row per
 * surfaced recommendation keyed by `(workspace_id, fingerprint)`, a status of
 * active/accepted/dismissed, an `ai_recommendation_actions` audit log, and RLS
 * letting any workspace member act. `source_area` is free-text, so the setup
 * checklist claims "setup" alongside the analytics areas already using it.
 *
 * "Completed" and "dismissed" are kept as distinct statuses even though both
 * hide the row: completed means the person says the task is handled, dismissed
 * means they don't want the suggestion. Collapsing them would throw away the
 * only signal that separates a finished setup from an unwanted one.
 */

const AREA = "setup";

export type SetupTaskState = "accepted" | "dismissed";

/** Server-side copy of each task's display metadata. The columns in
 *  ai_recommendations are NOT NULL, and resolving them here means the client
 *  only ever sends a task id — never arbitrary strings to be written to the
 *  database. Ids must match those built in dashboard-view.tsx. */
const SETUP_TASK_META: Record<string, { title: string; ctaLabel: string; ctaHref: string }> = {
  "connect-email": { title: "Connect your email", ctaLabel: "Connect", ctaHref: "/settings" },
  "connect-calendar": { title: "Connect your calendar", ctaLabel: "Connect", ctaHref: "/settings" },
  "import-leads": { title: "Import your leads", ctaLabel: "Import", ctaHref: "/leads" },
  "invite-team": { title: "Invite your team", ctaLabel: "Invite", ctaHref: "/settings" },
  "first-campaign": { title: "Send your first campaign", ctaLabel: "Create", ctaHref: "/campaigns" },
};

async function resolveContext(): Promise<{ workspaceId: string; userId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();
  const workspaceId = (profile as { workspace_id: string | null } | null)?.workspace_id;
  if (!workspaceId) return null;
  return { workspaceId, userId: user.id };
}

/**
 * Which setup tasks this workspace has already completed or dismissed, keyed
 * by task id. Fails open with an empty object: if this read breaks, the worst
 * outcome is the checklist showing a row someone already cleared, which is far
 * better than the dashboard failing to render.
 */
export async function getSetupTaskStates(): Promise<Record<string, SetupTaskState>> {
  try {
    const supabase = await createClient();
    const ctx = await resolveContext();
    if (!ctx) return {};

    const { data, error } = await supabase
      .from("ai_recommendations")
      .select("fingerprint, status")
      .eq("workspace_id", ctx.workspaceId)
      .eq("source_area", AREA)
      .in("status", ["accepted", "dismissed"]);
    if (error) return {};

    const states: Record<string, SetupTaskState> = {};
    for (const row of (data as { fingerprint: string; status: SetupTaskState }[]) || []) {
      // Fingerprints are stored as "setup:<taskId>" to match the convention
      // the analytics areas already use in this table.
      const taskId = row.fingerprint.startsWith(`${AREA}:`)
        ? row.fingerprint.slice(AREA.length + 1)
        : row.fingerprint;
      states[taskId] = row.status;
    }
    return states;
  } catch {
    return {};
  }
}

async function actionOnSetupTask(taskId: string, action: SetupTaskState): Promise<boolean> {
  const meta = SETUP_TASK_META[taskId];
  if (!meta) return false;

  const supabase = await createClient();
  const ctx = await resolveContext();
  if (!ctx) return false;

  const fingerprint = `${AREA}:${taskId}`;
  const now = new Date().toISOString();

  // Upsert on the table's own UNIQUE (workspace_id, fingerprint) — the setup
  // checklist, unlike the analytics insights, has no prior "sighting" write,
  // so the row usually does not exist yet on first click.
  const { data, error } = await supabase
    .from("ai_recommendations")
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        source_area: AREA,
        fingerprint,
        title: meta.title,
        cta_label: meta.ctaLabel,
        cta_href: meta.ctaHref,
        status: action,
        last_seen_at: now,
        actioned_at: now,
        actioned_by: ctx.userId,
      },
      { onConflict: "workspace_id,fingerprint" }
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[actionOnSetupTask]", error?.message);
    return false;
  }

  // Append-only history. A failure here must not undo the state change above,
  // so it is logged rather than surfaced.
  const { error: logError } = await supabase.from("ai_recommendation_actions").insert({
    recommendation_id: (data as { id: string }).id,
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    action,
  });
  if (logError) console.error("[actionOnSetupTask] audit log", logError.message);

  revalidatePath("/dashboard");
  return true;
}

/** Marks a setup task as done at the person's own word, even when the live
 *  signal (a connected mailbox, an imported lead) says otherwise — they may
 *  have handled it outside Nxelio. */
export async function completeSetupTask(taskId: string): Promise<boolean> {
  return actionOnSetupTask(taskId, "accepted");
}

/** Removes a setup task from the checklist without claiming it is done. */
export async function dismissSetupTask(taskId: string): Promise<boolean> {
  return actionOnSetupTask(taskId, "dismissed");
}
