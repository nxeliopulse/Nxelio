"use server";

export async function getEmailDomainStatus() {
  const { emailProvider, emailDomainVerified, emailFromAddress } = await import("@/lib/email/resend");
  return {
    provider: emailProvider, // "brevo" | "none"
    verified: emailDomainVerified, // Brevo configured
    from: emailFromAddress || "—",
  };
}
