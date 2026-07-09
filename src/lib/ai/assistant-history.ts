"use server";
import { createClient } from "@/lib/supabase/server";
import type { AssistantMessage } from "@/lib/ai/assistant";

export interface AssistantChatMeta {
  id: string;
  title: string;
  updated_at: string;
}

export async function listAssistantChats(): Promise<AssistantChatMeta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_chats")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);
  return data || [];
}

export async function getAssistantChat(id: string): Promise<AssistantMessage[] | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_chats")
    .select("messages")
    .eq("id", id)
    .single();
  return (data?.messages as AssistantMessage[]) ?? null;
}

/**
 * Create or update a chat. Pass chatId = null on the first exchange — the
 * title is derived from the first user message. Returns the chat id.
 */
export async function saveAssistantChat(
  chatId: string | null,
  messages: AssistantMessage[]
): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (chatId) {
    await supabase
      .from("assistant_chats")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("id", chatId);
    return chatId;
  }

  const firstUser = messages.find((m) => m.role === "user")?.content || "New chat";
  const title = firstUser.length > 48 ? firstUser.slice(0, 45) + "…" : firstUser;
  const { data } = await supabase
    .from("assistant_chats")
    .insert({ user_id: user.id, title, messages })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function deleteAssistantChat(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("assistant_chats").delete().eq("id", id);
}
