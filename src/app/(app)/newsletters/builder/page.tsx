import { Suspense } from "react";
import { NewsletterBuilder } from "@/components/newsletters/newsletter-builder";
import { getSegments } from "@/lib/queries/segments";
import { emailProvider, emailDomainVerified, emailFromAddress } from "@/lib/email/resend";

export default async function NewsletterBuilderPage() {
  const segments = await getSegments();
  return (
    <Suspense fallback={<div className="text-sm text-slate-500 p-6">Loading...</div>}>
      <NewsletterBuilder
        segments={segments}
        email={{ provider: emailProvider, canReachRecipients: emailDomainVerified, from: emailFromAddress }}
      />
    </Suspense>
  );
}
