// Plain constants/types shared by contact-calls.ts (a "use server" file, which
// can only export async functions — no runtime consts) and client components.
export const CALL_OUTCOMES = ["Connected", "Busy", "No Answer", "Left Voicemail", "Wrong Number"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
