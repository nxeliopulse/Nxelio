import { nylas } from "./client";

export interface RecentMessage {
  id: string;
  subject: string | null;
  from: string | null;
  date: number | null;
}

/**
 * Lists the most recent messages for a connected Nylas grant (mailbox).
 * `identifier` is the grant ID returned when the user connected their inbox.
 */
export async function listRecentMessages(identifier: string, limit = 10): Promise<RecentMessage[]> {
  const { data: messages } = await nylas().messages.list({
    identifier,
    queryParams: { limit },
  });

  return messages.map((m) => ({
    id: m.id,
    subject: m.subject ?? null,
    from: m.from?.[0]?.email ?? null,
    date: m.date ?? null,
  }));
}
