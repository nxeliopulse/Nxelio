import { LoadingSpinner } from "@/components/ui/loading-spinner";

// Shown instantly on navigation while getLeadDetail() resolves on the server,
// so clicking a lead gives immediate feedback instead of a frozen screen.
export default function LeadDetailLoading() {
  return <LoadingSpinner />;
}
