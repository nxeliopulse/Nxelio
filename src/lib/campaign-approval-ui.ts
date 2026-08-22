export const APPROVAL_STATUSES = ["Draft", "Pending review", "Approved", "Live/Distributing", "Archived"] as const;

/** Badge variant for each stage of the campaign content-approval lifecycle. */
export function approvalBadgeVariant(status: string): "default" | "warning" | "success" | "blue" | "outline" {
  switch (status) {
    case "Pending review": return "warning";
    case "Approved": return "success";
    case "Live/Distributing": return "blue";
    case "Archived": return "outline";
    default: return "default"; // Draft
  }
}
