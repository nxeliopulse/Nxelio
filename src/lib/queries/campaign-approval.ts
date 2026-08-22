"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCampaignById, type CampaignRow } from "@/lib/queries/campaigns";
import { notifyUsersByRole } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";

export type ApprovalStatus = "Draft" | "Pending review" | "Approved" | "Live/Distributing" | "Archived";

export interface ApprovalLogEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
  changed_by_name: string | null; // null = System
}

async function getReviewerRoleId(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("role_id").eq("role_name", "Reviewer").single();
  return data?.role_id ?? null;
}

/** Authenticated caller + their workspace/role — every transition function needs this. */
async function requireCaller(): Promise<{ userId: string; workspaceId: string; roleId: number | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role_id, workspace_id").eq("user_id", user.id).single();
  if (!profile?.workspace_id) throw new Error("No workspace");
  return { userId: user.id, workspaceId: profile.workspace_id as string, roleId: profile.role_id };
}

/** For gating the Approve/Send-back UI — never rely on this alone, the server actions re-check. */
export async function isCurrentUserApprover(): Promise<boolean> {
  try {
    const { roleId } = await requireCaller();
    const reviewerRoleId = await getReviewerRoleId();
    return roleId === 1 || (reviewerRoleId !== null && roleId === reviewerRoleId);
  } catch {
    return false;
  }
}

/** Only Super Admin or Reviewer may approve / send back a Pending review campaign. */
async function requireApprover(): Promise<{ userId: string; workspaceId: string }> {
  const { userId, workspaceId, roleId } = await requireCaller();
  const reviewerRoleId = await getReviewerRoleId();
  if (roleId !== 1 && (reviewerRoleId === null || roleId !== reviewerRoleId)) {
    throw new Error("Forbidden: only a Reviewer or Super Admin can do this.");
  }
  return { userId, workspaceId };
}

async function logTransition(
  campaignId: string,
  workspaceId: string,
  from: string | null,
  to: string,
  changedBy: string | null,
  comment?: string | null
) {
  const admin = createAdminClient();
  await admin.from("campaign_approval_log").insert({
    campaign_id: campaignId,
    workspace_id: workspaceId,
    from_status: from,
    to_status: to,
    changed_by: changedBy,
    comment: comment || null,
  });
}

async function loadCampaign(campaignId: string): Promise<CampaignRow> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

/** Who most recently submitted this campaign for review — used to block self-approval. */
async function getLastSubmitter(campaignId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_approval_log")
    .select("changed_by")
    .eq("campaign_id", campaignId)
    .eq("to_status", "Pending review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.changed_by ?? null;
}

function revalidateCampaign(campaignId: string) {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns/builder");
}

/** Draft -> Pending review. Notifies every Reviewer in the workspace. */
export async function submitForReview(campaignId: string) {
  const { userId, workspaceId } = await requireCaller();
  const campaign = await loadCampaign(campaignId);
  if (campaign.approval_status !== "Draft") {
    throw new Error("Only a Draft campaign can be submitted for review.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("campaigns").update({ approval_status: "Pending review" }).eq("id", campaignId);
  if (error) throw new Error(error.message || "Couldn't submit for review.");
  await logTransition(campaignId, workspaceId, campaign.approval_status, "Pending review", userId);

  const reviewerRoleId = await getReviewerRoleId();
  if (reviewerRoleId !== null) {
    await notifyUsersByRole(workspaceId, reviewerRoleId, {
      type: "campaign_review",
      title: `"${campaign.campaign_name}" needs review`,
      message: "A campaign is waiting for approval before it can be launched.",
      link: `/campaigns/builder?id=${campaignId}`,
    });
  }
  revalidateCampaign(campaignId);
}

/** Pending review -> Approved. Reviewer/Super Admin only, and never the person who submitted it. */
export async function approveCampaign(campaignId: string) {
  const { userId, workspaceId } = await requireApprover();
  const campaign = await loadCampaign(campaignId);
  if (campaign.approval_status !== "Pending review") {
    throw new Error("Only a Pending review campaign can be approved.");
  }
  if ((await getLastSubmitter(campaignId)) === userId) {
    throw new Error("You submitted this campaign for review — someone else needs to approve it.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("campaigns").update({ approval_status: "Approved" }).eq("id", campaignId);
  if (error) throw new Error(error.message || "Couldn't approve campaign.");
  await logTransition(campaignId, workspaceId, campaign.approval_status, "Approved", userId);
  revalidateCampaign(campaignId);
}

/** Pending review -> Draft, with a required comment so it doesn't silently disappear. */
export async function sendBackToDraft(campaignId: string, comment: string) {
  const { userId, workspaceId } = await requireApprover();
  const campaign = await loadCampaign(campaignId);
  if (campaign.approval_status !== "Pending review") {
    throw new Error("Only a Pending review campaign can be sent back.");
  }
  if (!comment.trim()) throw new Error("A comment is required when sending a campaign back.");
  const admin = createAdminClient();
  const { error } = await admin.from("campaigns").update({ approval_status: "Draft" }).eq("id", campaignId);
  if (error) throw new Error(error.message || "Couldn't send campaign back.");
  await logTransition(campaignId, workspaceId, campaign.approval_status, "Draft", userId, comment);
  revalidateCampaign(campaignId);
}

/** Approved/Live -> Archived. Any workspace member may retire a campaign. */
export async function archiveCampaign(campaignId: string) {
  const { userId, workspaceId } = await requireCaller();
  const campaign = await loadCampaign(campaignId);
  if (campaign.approval_status === "Archived") {
    throw new Error("This campaign is already archived.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("campaigns").update({ approval_status: "Archived" }).eq("id", campaignId);
  if (error) throw new Error(error.message || "Couldn't archive campaign.");
  await logTransition(campaignId, workspaceId, campaign.approval_status, "Archived", userId);
  revalidateCampaign(campaignId);
}

export async function getApprovalHistory(campaignId: string): Promise<ApprovalLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_approval_log")
    .select("id, from_status, to_status, comment, created_at, changed_by, users(full_name)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as { id: string; from_status: string | null; to_status: string; comment: string | null; created_at: string; changed_by: string | null; users: { full_name?: string } | null }[])
    .map((r) => ({
      id: r.id,
      from_status: r.from_status,
      to_status: r.to_status,
      comment: r.comment,
      created_at: r.created_at,
      changed_by_name: r.changed_by ? r.users?.full_name || "—" : null,
    }));
}
