import "server-only";

const API_KEY = process.env.AI_API_KEY;
const BASE_URL = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

export const aiConfigured = Boolean(API_KEY);

interface ChatOptions {
  system?: string;
  prompt: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls any OpenAI-compatible chat completions endpoint (Groq, DeepSeek, OpenAI...).
 * Swap provider by changing AI_API_KEY / AI_BASE_URL / AI_MODEL env vars — no code change.
 */
export async function aiChat({ system, prompt, json = false, temperature = 0.7, maxTokens = 2048 }: ChatOptions): Promise<string> {
  if (!API_KEY) throw new Error("AI not configured — set AI_API_KEY env var");

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
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
