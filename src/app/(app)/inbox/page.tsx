import { redirect } from "next/navigation";

// Inbox is no longer a standalone page — replies are viewed per-campaign, on
// that campaign's own "Inbox" tab (see CampaignDetailView + /campaigns/[id]).
export default function InboxPage() {
  redirect("/campaigns");
}
