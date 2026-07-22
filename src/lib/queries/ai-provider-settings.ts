"use server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { configuredProviders, type AiProviderName } from "@/lib/ai/provider";
import { aiChat } from "@/lib/ai/client";
import { revalidatePath } from "next/cache";

export interface AiProviderStatus {
  activeProvider: AiProviderName;
  updatedAt: string | null;
  providers: { provider: AiProviderName; configured: boolean }[];
}

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
  const admin = createAdminClient();
  const { data } = await admin.from("ai_provider_settings").select("active_provider, updated_at").eq("id", 1).maybeSingle();
  return {
    activeProvider: data?.active_provider === "groq" ? "groq" : "openai",
    updatedAt: data?.updated_at ?? null,
    providers: configuredProviders(),
  };
}

export async function setActiveAiProvider(provider: AiProviderName): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_provider_settings")
    .update({ active_provider: provider, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

export async function sendAiProviderTestMessage(): Promise<{ ok: boolean; reply?: string; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  try {
    const reply = await aiChat({
      system: "You are a debug ping. Reply with exactly: pong",
      prompt: "ping",
      temperature: 0,
      maxTokens: 20,
    });
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Test call failed" };
  }
}
