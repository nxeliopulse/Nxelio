import { getNewsletters, getNewsletterStats } from "@/lib/queries/newsletters";
import { NewslettersView } from "@/components/newsletters/newsletters-view";

export default async function NewslettersPage() {
  const [newsletters, stats] = await Promise.all([getNewsletters(), getNewsletterStats()]);
  return <NewslettersView newsletters={newsletters} stats={stats} />;
}
