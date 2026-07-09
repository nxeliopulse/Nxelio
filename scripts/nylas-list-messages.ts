/**
 * Proof-of-concept: list the 10 most recent messages from a connected Nylas grant.
 * Run with: node --env-file=.env.local -r tsx/cjs scripts/nylas-list-messages.ts
 * (or: npx tsx --env-file=.env.local scripts/nylas-list-messages.ts)
 */
import { listRecentMessages } from "../src/lib/nylas/messages";

const GRANT_ID = "be1c47ec-f032-421b-9ded-ed8e4ede396b"; // harirajanncse@gmail.com

async function main() {
  const messages = await listRecentMessages(GRANT_ID, 10);
  if (!messages.length) {
    console.log("No messages found for this grant.");
    return;
  }
  for (const m of messages) {
    console.log(m.subject || "(no subject)", "—", m.from || "(unknown sender)");
  }
}

main().catch((err) => {
  console.error("Failed to list messages:", err instanceof Error ? err.message : err);
  process.exit(1);
});
