import { notFound } from "next/navigation";
import { getLeadSearchJob } from "@/lib/leads/lead-search-jobs";
import { BuyProgressView } from "@/components/leads/buy-progress-view";

export default async function BuyProgressPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getLeadSearchJob(jobId);
  if (!job) notFound();
  return <BuyProgressView jobId={jobId} initialJob={job} />;
}
