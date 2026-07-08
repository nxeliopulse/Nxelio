"use server";
import { createClient } from "@supabase/supabase-js";

/**
 * Public lead capture (no auth required).
 * If a workspace slug is provided, the lead is routed to that workspace.
 * Otherwise it falls back to the Legacy Workspace (anon-default).
 */
export async function capturePublicLead(payload: {
  fullName?: string;
  companyName?: string;
  email: string;
  phone?: string;
  websiteUrl?: string;
  industry?: string;
  interestArea?: string;
  message?: string;
  linkedin?: string;
  workspaceSlug?: string;
}) {
  if (!payload.fullName && !payload.companyName) {
    return { ok: false, error: "Name or company is required" };
  }
  if (!payload.email && !payload.websiteUrl) {
    return { ok: false, error: "Email or website is required" };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  // Resolve workspace_id from slug if provided
  let workspaceId: string | null = null;
  if (payload.workspaceSlug) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("capture_slug", payload.workspaceSlug)
      .single();
    if (ws) workspaceId = ws.id;
  }

  const insertPayload: Record<string, unknown> = {
    full_name: payload.fullName?.trim() || null,
    company_name: payload.companyName?.trim() || null,
    email: payload.email?.trim().toLowerCase() || null,
    phone: payload.phone?.trim() || null,
    website_url: payload.websiteUrl?.trim() || null,
    industry: payload.industry || null,
    interest_area: payload.interestArea || null,
    message: payload.message?.trim() || null,
    linkedin: payload.linkedin?.trim() || null,
    source: "Public Capture Form",
    status: "New",
    lead_score: 0,
  };
  if (workspaceId) insertPayload.workspace_id = workspaceId;

  const { error } = await supabase.from("leads").insert(insertPayload);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** Resolve workspace name + slug existence — used by the capture page header */
export async function getCaptureWorkspaceInfo(slug: string): Promise<{ exists: boolean; name?: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase.from("workspaces").select("name").eq("capture_slug", slug).single();
  if (!data) return { exists: false };
  return { exists: true, name: data.name };
}
