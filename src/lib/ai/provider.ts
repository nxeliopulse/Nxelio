import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AiProviderName = "openai" | "groq";

export interface AiProviderConfig {
  provider: AiProviderName;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
}

const PROVIDER_DEFAULTS: Record<AiProviderName, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

function configFor(provider: AiProviderName): AiProviderConfig {
  if (provider === "groq") {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL || PROVIDER_DEFAULTS.groq.baseUrl,
      model: process.env.GROQ_MODEL || PROVIDER_DEFAULTS.groq.model,
    };
  }
  // OpenAI — falls back to the legacy generic AI_* vars so existing deployments
  // that haven't renamed their env vars yet keep working unchanged.
  return {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || PROVIDER_DEFAULTS.openai.baseUrl,
    model: process.env.OPENAI_MODEL || process.env.AI_MODEL || PROVIDER_DEFAULTS.openai.model,
  };
}

/** Reads which provider is active from the platform-wide setting (Super Admin panel). Defaults to OpenAI if unset. */
export async function getActiveAiProvider(): Promise<AiProviderName> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("ai_provider_settings").select("active_provider").eq("id", 1).maybeSingle();
    const provider = data?.active_provider;
    return provider === "groq" ? "groq" : "openai";
  } catch {
    return "openai";
  }
}

/** Resolves the full config (key/url/model) for whichever provider is currently active. */
export async function resolveAiConfig(): Promise<AiProviderConfig> {
  const provider = await getActiveAiProvider();
  return configFor(provider);
}

export function configuredProviders(): { provider: AiProviderName; configured: boolean }[] {
  return (["openai", "groq"] as const).map((p) => ({ provider: p, configured: Boolean(configFor(p).apiKey) }));
}
