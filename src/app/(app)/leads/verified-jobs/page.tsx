import { listLeadSearchJobs } from "@/lib/leads/lead-search-jobs";
import { VerifiedLeadsJobsView } from "@/components/leads/verified-leads-jobs-view";

export default async function VerifiedLeadsJobsPage() {
  const jobs = await listLeadSearchJobs();
  return <VerifiedLeadsJobsView initialJobs={jobs} />;
}
