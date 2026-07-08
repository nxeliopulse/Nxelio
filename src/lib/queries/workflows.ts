"use server";
import { createClient } from "@/lib/supabase/server";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";

export interface WorkflowNode {
  id: string;
  type: "trigger" | "action" | "delay" | "condition";
  subtype: string;
  label: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowConfig {
  nodes: WorkflowNode[];
  edges?: { from: string; to: string; branch?: "YES" | "NO" }[];
}

export interface WorkflowRow {
  id: string;
  workflow_name: string;
  description: string | null;
  folder: string;
  status: string;
  config: WorkflowConfig | null;
  created_at: string;
  updated_at: string;
}

export async function getWorkflows(): Promise<(WorkflowRow & { executions: number })[]> {
  const supabase = await createClient();
  const { data: workflows } = await supabase.from("workflows").select("*").order("updated_at", { ascending: false });
  if (!workflows) return [];
  const counts = await Promise.all(
    workflows.map(async (w) => {
      const { count } = await supabase
        .from("workflow_executions")
        .select("*", { count: "exact", head: true })
        .eq("workflow_id", w.id);
      return count || 0;
    })
  );
  return workflows.map((w, i) => ({ ...w, executions: counts[i] }));
}

export async function getWorkflowById(id: string): Promise<WorkflowRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("workflows").select("*").eq("id", id).single();
  if (!data) return null;
  // config is stored as JSONB; ensure it's parsed (Supabase returns JSON already, but guard against strings)
  let config: WorkflowConfig | null = null;
  if (data.config) {
    if (typeof data.config === "string") {
      try {
        config = JSON.parse(data.config) as WorkflowConfig;
      } catch {
        config = null;
      }
    } else {
      config = data.config as WorkflowConfig;
    }
  }
  return { ...data, config };
}

export async function createWorkflow(payload: Partial<WorkflowRow>) {
  const supabase = await createClient();
  const insertRow: Record<string, unknown> = {
    workflow_name: payload.workflow_name || "Untitled Workflow",
    folder: payload.folder || "Lead Generation",
    status: payload.status || "Draft",
    description: payload.description ?? null,
  };
  if (payload.config !== undefined) {
    insertRow.config = payload.config;
  }
  const { data, error } = await supabase
    .from("workflows")
    .insert(insertRow)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/workflows");
  return data;
}

export async function updateWorkflow(id: string, payload: Partial<WorkflowRow>) {
  const supabase = await createClient();
  const updateRow: Record<string, unknown> = {};
  if (payload.workflow_name !== undefined) updateRow.workflow_name = payload.workflow_name;
  if (payload.description !== undefined) updateRow.description = payload.description;
  if (payload.folder !== undefined) updateRow.folder = payload.folder;
  if (payload.status !== undefined) updateRow.status = payload.status;
  if (payload.config !== undefined) updateRow.config = payload.config;
  updateRow.updated_at = new Date().toISOString();
  const { error } = await supabase.from("workflows").update(updateRow).eq("id", id);
  if (error) throw error;
  revalidatePath("/workflows");
  revalidatePath("/workflows/builder");
}

export async function deleteWorkflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/workflows");
}

export interface TestRunStep {
  name: string;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  branch?: "YES" | "NO";
  type?: WorkflowNode["type"];
}

export interface TestRunResult {
  steps: TestRunStep[];
  simulated: true;
  workflowName: string;
}

/**
 * Simulates a workflow run end-to-end. Pass either an existing workflowId (config is loaded from DB)
 * or an in-memory config (for testing the unsaved canvas). When workflowId is provided, the
 * execution is also written to workflow_executions.
 */
export async function testRunWorkflow(
  workflowId: string | null,
  workflowName: string,
  config?: WorkflowConfig
): Promise<TestRunResult> {
  const supabase = await createClient();

  // Resolve which config to simulate over
  let runConfig: WorkflowConfig | null = config ?? null;
  if (!runConfig && workflowId) {
    const wf = await getWorkflowById(workflowId);
    runConfig = wf?.config ?? null;
  }

  const nodes = runConfig?.nodes ?? [];

  const steps: TestRunStep[] = nodes.length
    ? nodes.map((n) => {
        // Pick a plausible simulated duration per node type
        const base =
          n.type === "trigger" ? 12 :
          n.type === "delay" ? 0 :
          n.type === "condition" ? 23 :
          /* action */ 100 + Math.floor(Math.random() * 80);
        return {
          name: n.label || n.subtype || n.id,
          status: n.type === "delay" ? "skipped" : "ok",
          durationMs: base,
          type: n.type,
        };
      })
    : [
        // Fallback when there's literally nothing on the canvas
        { name: "Empty workflow — nothing to run", status: "skipped", durationMs: 0 },
      ];

  const result: TestRunResult = {
    steps,
    simulated: true,
    workflowName,
  };

  if (workflowId) {
    await supabase.from("workflow_executions").insert({
      workflow_id: workflowId,
      status: "Success",
      result,
      completed_at: new Date().toISOString(),
    });
    revalidatePath("/workflows");
    revalidatePath(`/workflows/builder`);
  }

  await notifyCurrentUser({
    type: "workflow",
    title: `Workflow "${workflowName}" tested`,
    message: `${result.steps.length} step${result.steps.length === 1 ? "" : "s"} executed.`,
    link: "/workflows",
  });

  return result;
}

export async function getRecentExecutions(workflowId?: string) {
  const supabase = await createClient();
  let query = supabase.from("workflow_executions").select("*").order("started_at", { ascending: false }).limit(20);
  if (workflowId) query = query.eq("workflow_id", workflowId);
  const { data } = await query;
  return data || [];
}
