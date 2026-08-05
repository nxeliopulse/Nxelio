// Plain constants/types shared by contact-documents.ts (a "use server" file,
// which can only export async functions — no runtime consts) and client components.
export const DOC_TYPES = ["Quote", "Proposal", "Contract", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_STATUSES = ["Draft", "Sent", "Viewed", "Signed"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
