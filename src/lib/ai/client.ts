import "server-only";
import { resolveAiConfig } from "@/lib/ai/provider";

/** Whether the currently active provider (OpenAI/Groq, per the Super Admin panel) has an API key configured. */
export async function aiConfigured(): Promise<boolean> {
  const { apiKey } = await resolveAiConfig();
  return Boolean(apiKey);
}

interface ChatOptions {
  system?: string;
  prompt: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls any OpenAI-compatible chat completions endpoint (Groq, OpenAI...).
 * Which provider/model is used is resolved at request time from the platform-wide
 * AI Provider setting (Super Admin panel) — see src/lib/ai/provider.ts.
 */
export async function aiChat({ system, prompt, json = false, temperature = 0.7, maxTokens = 2048 }: ChatOptions): Promise<string> {
  const { apiKey, baseUrl, model } = await resolveAiConfig();
  if (!apiKey) throw new Error("AI not configured — set the active provider's API key env var");

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    // Log the real detail for debugging, but surface a calm, user-friendly message.
    const text = await res.text().catch(() => "");
    console.error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
    const friendly =
      res.status === 429
        ? "The AI is busy right now. Please try again in a moment."
        : res.status === 401 || res.status === 403
          ? "The AI service isn't configured correctly. Please contact your admin."
          : res.status === 404
            ? "The AI service is temporarily unavailable. Please try again shortly."
            : "Something went wrong with the AI. Please try again in a moment.";
    throw new Error(friendly);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Calls the model and parses a JSON object response. Throws if parsing fails. */
export async function aiJson<T>(opts: ChatOptions): Promise<T> {
  const raw = await aiChat({ ...opts, json: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Some models wrap JSON in markdown fences — strip and retry
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as T;
  }
}
