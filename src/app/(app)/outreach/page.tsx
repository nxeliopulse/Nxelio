import { redirect } from "next/navigation";

// Outreach merged into the unified Campaigns screen (Sequences tab).
export default function OutreachPage() {
  redirect("/campaigns");
}
